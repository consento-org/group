import { Group, GroupOptions } from '../Group'
import { HypercoreFeed } from './Feed'
import { FeedLoader } from '../Feed'
import SDK, {
  SDKOptions,
  Hypercore,
  HypercoreOptions
} from 'hyper-sdk'
import { randomBytes } from 'crypto'
import { ID, FeedItem } from '../FeedItem'

export type HypercoreLoader = (id: ID) => Promise<Hypercore>

export interface HypercoreGroupOptions extends GroupOptions, SDKOptions {
  Hypercore?: <E=Buffer>(keyOrName: string, opts?: HypercoreOptions) => Hypercore<E>
  close?: () => Promise<void>
}

export async function defaultClose (): Promise<void> {}

interface LoaderAndClose {
  loadFeed: FeedLoader
  close: () => Promise<void>
}

export class HypercoreGroup extends Group {
  private readonly _close: () => Promise<void>

  private static async makeLoader ({ Hypercore, persist = false, ...options }: HypercoreGroupOptions = {}): Promise<LoaderAndClose> {
    let getHypercore = Hypercore
    let close = defaultClose

    if (Hypercore === undefined) {
      const { Hypercore, close: sdkClose } = await SDK({ persist, ...options })
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

    return { loadFeed, close }
  }

  static async create (options: HypercoreGroupOptions = {}): Promise<HypercoreGroup> {
    const { loadFeed, close } = await this.makeLoader(options)
    const group = new HypercoreGroup({ ...options, loadFeed, close })

    const { id } = options

    await group.createOwnFeed(id)

    const finalID = group.feed.id

    await group.init(finalID)

    return group
  }

  static async load (options: HypercoreGroupOptions = {}): Promise<HypercoreGroup> {
    const { loadFeed, close } = await this.makeLoader(options)
    const group = new HypercoreGroup({ ...options, loadFeed, close })
    const { id = randomBytes(8).toString('hex') } = options
    await group.init(id)

    return group
  }

  constructor ({
    close = defaultClose,
    ...options
  }: HypercoreGroupOptions) {
    super(options)
    this._close = close
  }

  async close (): Promise<void> {
    await super.close()

    return await this._close()
  }
}
