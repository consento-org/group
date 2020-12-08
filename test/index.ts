import tape from "fresh-tape";

import { Member } from "../src/member";

const EXAMPLE_ID = "example";

tape("Able to initialize a member", (t) => {
  const member = new Member();

  member.processFeeds();

  t.pass("Able to process feeds with zero data");

  t.end();
});

tape("Able to add a member by ID", (t) => {
  const member = new Member();

  const req = member.requestAdd(EXAMPLE_ID);

  t.ok(req, "Generated a request");

  const res = member.acceptRequest(req);

  t.ok(res, "Generated response");

  member.processFeeds();

  t.pass("Processed feeds");

  const expectedMembers = [member.id, EXAMPLE_ID];
  t.deepEqual(
    member.knownMembers,
    expectedMembers,
    "New member got added to list"
  );

  t.end();
});

tape("Able to add a member by ID and sync", (t) => {
  const member = new Member();
  const other = new Member({ initiator: member.id });

  const req = member.requestAdd(other.id);

  t.ok(req, "Generated a request");

  const res = member.acceptRequest(req);

  t.ok(res, "Generated response");

  member.processFeeds();

  other.sync(member);

  t.pass("Able to sync with member");

  other.processFeeds();

  t.pass("Able to process feeds after sync");

  const expectedMembers = [member.id, other.id];
  t.deepEqual(
    other.knownMembers,
    expectedMembers,
    "New member saw itself added to list"
  );

  t.end();
});

tape("Process request by syncing one peer at a time", (t) => {
  const members = initializeMembers(5);

  let previous = members[0];
  previous.requestAdd(EXAMPLE_ID);
  previous.processFeeds();

  for (let next of members.slice(1)) {
    sync(previous, next);
    previous = next;
  }

  const wasAdded = previous.knownMembers.includes(EXAMPLE_ID);
  t.ok(wasAdded, "Request got processed successfully");

  t.end();
});

function sync(member1: Member, member2: Member) {
  let needsProcessing = true;
  while (needsProcessing) {
    member1.sync(member2);
    member2.sync(member1);

    const needsProcessing1 = member1.processFeeds();
    const needsProcessing2 = member2.processFeeds();

    needsProcessing = needsProcessing1 || needsProcessing2;
  }
}

function initializeMembers(n: number) {
  const members: Member[] = [];
  while (n--) members.push(new Member());

  const knownMembers = members.map(({ id }: Member) => id);
  for (let member of members) {
    member.knownMembers = knownMembers;
  }

  return members;
}
