import { Request } from './member'
import { States } from './States'

export type MemberState = 'added' | 'removed'
export type MemberId = string

export class Permissions {
  readonly members = new States<MemberState>()

  add (item: Request): void {
    this.members.set(item.who, 'added')
  }
}
