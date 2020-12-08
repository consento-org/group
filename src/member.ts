import { randomBytes } from "crypto";
import { EventEmitter } from "events";

type ResponseType = "accept" | "deny" | "cancel" | "conflict";
type ResponseState = "pending" | "ready" | "cancelled" | "failed" | "finished";
type Operation = "add" | "remove" | "merge";
type RequestIdentifier = "request";
type ResponseIdentifier = "response";
type FeedItem = Request | Response;

type ID = string;

const REQUEST_TYPE = "request" as RequestIdentifier;
const RESPONSE_TYPE = "response" as ResponseIdentifier;

interface RawRequest {
  // Used to differentiate between req/res
  type: RequestIdentifier;
  // ID of the request
  id: ID;
  // ID of the creator
  from: ID;
  // What sort of operation this is
  operation: Operation;
}

interface WhoRequest extends RawRequest{
  // Who to add or remove
  who: ID;
}

interface MergeRequest extends RawRequest {
  // Which requests have been merged for this one
  toMerge: Request[];
}

type Request = WhoRequest | MergeRequest

interface Response {
  // Used to differentiate between req/res
  type: ResponseIdentifier;
  // ID of the request
  id: ID;
  // ID of the request creator
  from: ID;
  // Our response to this request
  response: ResponseType;
}

class RequestState {
  req: Request;
  signatures: {
    [id in ID]: Response;
  };
  finished: boolean;

  constructor(req: Request) {
    this.req = req;
    this.signatures = {};
    this.finished = false;
  }

  getState(neededSignatures: number): ResponseState {
    if (this.finished) return "finished";
    if (this.isCancelled()) return "cancelled";
    if (this.isConflicted()) return "failed";
    if (this.numberAccepted() >= neededSignatures) return "ready";
    if (this.numberDenied() >= neededSignatures) return "failed";

    return "pending";
  }

  addResponse(author: ID, response: Response) {
    this.signatures[author] = response;
  }

  get id() {
    return this.req.id;
  }

  get from() {
    return this.req.from;
  }

  get operation() {
    return this.req.operation;
  }

  numberDenied(): number {
    return Object.keys(this.signatures).filter((id: ID) => {
      return this.signatures[id].response === "deny";
    }).length;
  }

  numberAccepted(): number {
    return Object.keys(this.signatures).filter((id: ID) => {
      return this.signatures[id].response === "accept";
    }).length;
  }

  isConflicted(): boolean {
    return Object.keys(this.signatures).some((id: ID) => {
      return this.signatures[id].response === "conflict";
    });
  }

  isCancelled(): boolean {
    return this.signatures[this.from].response === ("cancel" as ResponseType);
  }

  finish() {
    this.finished = true;
  }
}

function allowAll(request: Request): boolean {
  return true;
}

interface ShouldAcceptCB {
  (request: Request): boolean;
}

interface MemberConstructorOptions {
  id?: ID;
  initiator?: ID;
  shouldAccept: ShouldAcceptCB;
}

export class Member extends EventEmitter {
  id: ID;
  ownFeed: FeedItem[];
  knownFeeds: {
    [id in ID]: FeedItem[];
  };
  memberIndexes: {
    [id in ID]: number;
  };
  ownIndex: number;
  requests: {
    [id in ID]: RequestState;
  };
  knownMembers: string[];
  shouldAccept: ShouldAcceptCB;

  constructor(
    { id, initiator, shouldAccept = allowAll }: MemberConstructorOptions = {
      shouldAccept: allowAll,
    }
  ) {
    super();
    this.id = id || makeID();
    this.ownFeed = [];
    this.ownIndex = 0;
    this.knownFeeds = {
      [this.id]: this.ownFeed,
    };
    this.memberIndexes = {
      [this.id]: 0,
    };
    this.requests = {};
    this.knownMembers = [initiator || this.id];
    this.shouldAccept = shouldAccept;
  }

  sync(member: Member) {
    // Iterate through member's knownFeeds
    // Get any new data you don't have
    // Get new data from members to knownFeeds
    for (const id of Object.keys(member.knownFeeds)) {
      const feed = member.knownFeeds[id];
      const ownCopy = this.getFeedFor(id);
      if (ownCopy.length < feed.length) {
        this.updateFeedFor(id, feed);
      }
    }
  }

  processFeeds() {
    let hasProcessed = false;
    let needsReprocess = false;
    for (const id of Object.keys(this.knownFeeds)) {
      const index = this.getMemberIndexFor(id);
      const feed = this.getFeedFor(id);
      const item = feed[index];

      if (!item) continue;
      hasProcessed = true;

      if (isRequest(item)) {
        this.trackRequest(item);

        // TODO: Detect Forks
        if (this.isMember()) {
          const shouldAccept = this.shouldAccept(item);
          if (shouldAccept) this.acceptRequest(item);
          else this.denyRequest(item);
        }
      } else if (isResponse(item)) {
        if (this.hasRequest(item.id)) {
          const req = this.getRequest(item.id);
          req.addResponse(id, item);
          let neededSignatures = this.knownMembers.length;
          if (req.operation === "remove") neededSignatures--;
          const state = req.getState(neededSignatures);
          if (req.getState(neededSignatures) === "ready") {
            if (this.isMember()) {
              if (req.operation === "add") {
                if(isWho(req.req)) {
                this.knownMembers.push(req.req.who);
                }
              } else if (req.operation === "remove") {
                if(isWho(req.req))
                this.knownMembers = this.knownMembers.filter(
                  (id) => id !== req.req.who
                );
              }
              req.finish();
              this.emit("block", req);
            }
          }
          this.incrementMemberIndexFor(id);
        } else {
          continue;
        }
      }
    }

    if (hasProcessed) this.processFeeds();
  }

  private updateFeedFor(id: ID, feed: FeedItem[]) {
    this.knownFeeds[id] = feed.slice(0);
  }

  private hasNewFeedItemsFor(id: ID): boolean {
    return this.getMemberIndexFor(id) === this.getFeedFor(id).length - 1;
  }

  private getMemberIndexFor(id: ID): number {
    if (this.memberIndexes[id]) return this.memberIndexes[id];
    this.memberIndexes[id] = 0;
    return 0;
  }

  private incrementMemberIndexFor(id: ID) {
    this.memberIndexes[id] = this.getMemberIndexFor(id) + 1;
  }

  private getFeedFor(id: ID): FeedItem[] {
    if (!this.knownFeeds[id]) {
      this.knownFeeds[id] = [];
    }

    return this.knownFeeds[id];
  }

  private hasRequest(id: ID): boolean {
    return !!this.requests[id];
  }

  private trackRequest(request: Request) {
    const { id } = request;
    this.requests[id] = new RequestState(request);
  }

  private getRequest(id: ID): RequestState {
    return this.requests[id];
  }

  requestAdd(who: ID): Request {
    return this.makeRequest(who, "add");
  }

  requestRemove(who: ID): Request {
    return this.makeRequest(who, "remove");
  }

  makeRequest(who: ID, operation: Operation): Request {
    const req = {
      type: REQUEST_TYPE,
      id: makeID(),
      from: this.id,
      who,
      operation,
    };

    this.ownFeed.push(req);

    return req;
  }

  makeResponse(request: Request, response: ResponseType): Response {
    const { id, from } = request;
    const res = {
      type: RESPONSE_TYPE,
      from,
      id,
      response,
    };

    this.ownFeed.push(res);

    return res;
  }

  acceptRequest(request: Request): Response {
    return this.makeResponse(request, "accept");
  }

  denyRequest(request: Request): Response {
    return this.makeResponse(request, "deny");
  }

  isMember() {
    return this.knownMembers.includes(this.id);
  }
}

function isRequest(item: FeedItem): item is Request {
  return item.type === REQUEST_TYPE;
}

function isResponse(item: FeedItem): item is Response {
  return item.type === RESPONSE_TYPE;
}

function isMerge(item: Request): item is MergeRequest {
  return item.toMerge !== undefined
}

function isWho(item: Request) : item is WhoRequest {
  return item.who !== undefined
}

function makeID(): ID {
  return randomBytes(8).toString("hex");
}
