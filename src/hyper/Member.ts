import { Member, MemberOptions } from '../Member'
import { HypercoreFeed } from './Feed'
import { FeedLoader } from '../Feed'
import SDK, {
  SDKOptions,
  Hypercore,
  HypercoreOptions
} from 'hyper-sdk'
import { ID, FeedItem } from '../FeedItem'

export type HypercoreLoader = (id: ID) => Promise<Hypercore>

export interface HypercoreMemberOptions extends MemberOptions, SDKOptions {
  Hypercore?: <E=Buffer>(keyOrName: string, opts?: HypercoreOptions) => Hypercore<E>
  close?: () => Promise<void>
}

export async function defaultClose (): Promise<void> {}

export class HypercoreMember extends Member {
  private readonly _close: () => Promise<void>

  static async create ({ Hypercore, ...options }: HypercoreMemberOptions = {}): Promise<HypercoreMember> {
    let getHypercore = Hypercore
    let close = defaultClose

    if (Hypercore === undefined) {
      const { Hypercore, close: sdkClose } = await SDK(options)
      getHypercore = Hypercore
      close = sdkClose
    }

    const loadFeed: FeedLoader = async (id: ID) => {
      if (getHypercore === undefined) throw new Error('Hypercore constructor not initialized')
      const core = getHypercore<FeedItem>(id, {
        valueEncoding: 'json',
        sparse: false
      })

      await core.ready()

      return new HypercoreFeed(core)
    }

    const member = new HypercoreMember({ ...options, loadFeed, close })

    await member.init()

    return member
  }

  constructor ({
    close = defaultClose,
    ...options
  }: HypercoreMemberOptions) {
    super(options)
    this._close = close
  }

  async close (): Promise<void> {
    await super.close()

    return await this._close()
  }
}
