import tape from "fresh-tape";

import {Member} from "../src/member"

tape("Able to initialize a member", (t) => {
  const member = new Member()

  member.processFeeds()

  t.end()
})
