
import runMemberTest from './Member'

/*
import { Member, MemberOptions } from '../src/Member'

async function createMember (options? : MemberOptions): Promise<Member> {
 return await Member.create(options)
}

runMemberTest(createMember)
*/

import { HypercoreMember, HypercoreMemberOptions } from '../src/hyper/Member'

runMemberTest(createHypercoreMember, 'HypercoreMember')

async function createHypercoreMember (options: HypercoreMemberOptions = {}): Promise<HypercoreMember> {
  const finalOptions = { ...options, persist: false }

  return await HypercoreMember.create(finalOptions)
}
