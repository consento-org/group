import tape from "fresh-tape";

import { Member } from "../src/member";

const EXAMPLE_ID = "example";
const EXAMPLE_ID_2 = "example2";

tape("Able to initialize a member", (t) => {
  const member = new Member();

  t.pass("Able to process feeds with zero data");

  t.end();
});

tape("Able to add a member by ID", (t) => {
  const member = new Member();

  const req = member.requestAdd(EXAMPLE_ID);

  t.ok(req, "Generated a request");

  t.equal(member.ownFeed[1].type, "response", "auto-generated response")

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
    next.acceptPending();
    sync(previous, next);
    previous = next;
  }

  const wasAdded = previous.knownMembers.includes(EXAMPLE_ID);
  t.ok(wasAdded, "Request got processed successfully");

  t.end();
});

tape("Two members do an add at once", (t) => {
	const members = initializeMembers(5)

	const [a,b,c,d,e] = members

	const f = new Member()
	const g = new Member()
	f.knownMembers = a.knownMembers.slice()
	g.knownMembers = a.knownMembers.slice()

  const requestA = a.requestAdd(f.id)

  const requestD = d.requestAdd(g.id)

  sync(a,b)

  t.equal(b.acceptPending(), 1, "B accepted Request A")

  sync(d,e)

  t.equal(e.acceptPending(), 1, "E accepted Request D")

  sync(e, c)
  sync(b, c)

  const pending = c.getPendingRequests()

  t.equal(pending.length, 2, "C sees 2 pending requests")

  sync(c, b)

  t.equal(b.acceptPending(), 1, "B accepted Request D")

  sync(c, e)

  t.equal(e.acceptPending(), 1, "E accepted Request A")

  sync(e, d)

  t.equal(d.acceptPending(), 1, "D accepted Request A")

  sync(b, a)

  t.equal(a.acceptPending(), 1, "A accepted request D")

  sync(a, c)
  sync(d, c)

  const ready = c.getPendingRequests()

  t.equal(ready.length, 2, "C sees 2 pending requests")

  c.acceptPending()

  const wasAddedA = c.knownMembers.includes(f.id);

  const wasAddedD = c.knownMembers.includes(g.id);

  t.notOk(wasAddedA, 'F was not added via A')
  t.ok(wasAddedD, 'G was added via D')

  sync(c, g)

  const finallyPending = g.getPendingRequests()

  t.equal(finallyPending.length, 1, "G sees 1 pending request")

  t.equal(g.acceptPending(), 1, "G accepted request A")

  const wasFinallyAddedA = g.knownMembers.includes(f.id)

  t.ok(wasFinallyAddedA, 'F was added via A')

  t.end()
})

function sync(member1: Member, member2: Member) {
  member1.sync(member2);
  member2.sync(member1);
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
