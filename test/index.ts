
import runGroupTest from './Group'

import { Group } from '../src/Group'

import { HypercoreGroup } from '../src/hyper/Group'

runGroupTest(Group)

runGroupTest(HypercoreGroup, 'HypercoreGroup')
