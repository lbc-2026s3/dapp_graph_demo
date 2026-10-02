// codegen 生成的类型：
// - generated/UPT26：合约事件。ApprovalEvent 对应链上的 Approval 日志。
// - generated/schema：schema.graphql 里的实体类。new 只在这次映射的内存里建对象；
//   save() 交给正在索引这份 subgraph 的 Graph Node，写入它自己的 Postgres，不是合约、也不是前端的库。
//   本地是 docker-compose 里的 postgres 服务；部署到 Subgraph Studio 后是 The Graph 索引节点上的库。
//   查询走该 subgraph 的 GraphQL 接口，不直接连 Postgres。
import { Address, BigInt } from "@graphprotocol/graph-ts"
import {
  Approval as ApprovalEvent,
  Transfer as TransferEvent
} from "../generated/UPT26/UPT26"
import { Approval, BalanceSnapshot, Transfer, User } from "../generated/schema"

// 2^32。同一区块里 logIndex 排在 blockNumber 后面，保证 sortKey 随区块和日志递增。
const SORT_KEY_BLOCK_STRIDE = "4294967296" // 2^32 = 4294967296

// 地址第一次出现在 Transfer 里时建档，余额从 0 开始，之后只靠事件加减。
function getOrCreateUser(address: Address): User {
  let existing = User.load(address)
  if (existing != null) {
    return existing
  }

  let created = new User(address)
  created.balance = BigInt.zero()
  return created
}

// 记下这次转账之后的余额。User.balance 只保留最新值，历史余额靠这些快照查询。
function saveBalanceSnapshot(user: User, event: TransferEvent): void {
  let snapshot = new BalanceSnapshot(
    event.transaction.hash.concatI32(event.logIndex.toI32()).concat(user.id)
  )
  snapshot.user = user.id
  snapshot.balance = user.balance
  snapshot.blockNumber = event.block.number
  snapshot.logIndex = event.logIndex
  // GraphQL 一次只能按一个字段排序，所以把「区块号 + 日志序号」合成一个数。
  // sortKey = 区块号 * 2^32 + logIndex。区块号在高位，同一区块内 logIndex 在低位。
  // 例如区块 20 的第 2、3 条日志分别是 20 * 2^32 + 2 和 20 * 2^32 + 3，第 3 条更大；
  // 区块 21 的任何日志都比区块 20 大。查某高度时取 sortKey 最大的一条，就是该区块最后一笔之后的余额。
  snapshot.sortKey = event.block.number
    .times(BigInt.fromString(SORT_KEY_BLOCK_STRIDE))
    .plus(event.logIndex)
  snapshot.blockTimestamp = event.block.timestamp
  snapshot.transactionHash = event.transaction.hash
  snapshot.save()
}

// subgraph.yaml 把 Approval(address,address,uint256) 绑到这个函数。
// 索引器从 startBlock 往后扫 Sepolia，「每遇到一条该事件日志就调用一次」。
// 典型来源是合约上 approve(spender, value) 成功。
export function handleApproval(event: ApprovalEvent): void {
  // 同一笔交易可以发出多条日志，单用交易哈希会撞 id。
  // 所以用「交易哈希 ++ 该日志在交易里的序号 logIndex」作为主键。
  let entity = new Approval(
    event.transaction.hash.concatI32(event.logIndex.toI32())
  )
  // event.params 是日志里解码出来的三个参数。
  entity.owner = event.params.owner // 代币主人，谁在授权
  entity.spender = event.params.spender // 被授权的地址
  entity.value = event.params.value // 允许 spender 代花的额度

  // 事件本身没有这些字段，从所在区块和交易上补上，方便按时间查询。
  entity.blockNumber = event.block.number
  entity.blockTimestamp = event.block.timestamp
  entity.transactionHash = event.transaction.hash

  // 写入正在索引这份 subgraph 的 Graph Node 自己的 Postgres
  // （本地是 docker-compose 里的 postgres；Graph Studio 上是 The Graph 索引节点的库）。
  // 不调用 save()，上面的赋值都不会被保存。
  entity.save()
}

// 同理，每条 Transfer 日志调用一次。transfer 和 transferFrom 都会发这个事件。
// 同时更新双方余额：铸币只加接收方，销毁只减发送方，普通转账一边减一边加。
export function handleTransfer(event: TransferEvent): void {
  let fromAddress = event.params.from // 转出地址；铸币时是 0 地址
  let toAddress = event.params.to // 转入地址；销毁时是 0 地址
  let value = event.params.value

  // 0 地址不是用户。铸币没有发送方，销毁没有接收方。
  let zero = Address.zero()
  let fromIsZero = fromAddress.equals(zero)
  let toIsZero = toAddress.equals(zero)
  let sameUser = fromAddress.equals(toAddress)

  // 自己转给自己时必须共用同一个对象。两边各 load 一次时，第二次还读不到未 save 的余额。
  let fromUser: User | null = fromIsZero ? null : getOrCreateUser(fromAddress)
  let toUser: User | null = toIsZero
    ? null
    : sameUser
      ? fromUser
      : getOrCreateUser(toAddress)

  if (fromUser != null) {
    fromUser.balance = fromUser.balance.minus(value)
  }
  if (toUser != null) {
    toUser.balance = toUser.balance.plus(value)
  }
  if (fromUser != null) {
    fromUser.save()
    saveBalanceSnapshot(fromUser, event)
  }
  if (toUser != null && !sameUser) {
    toUser.save()
    saveBalanceSnapshot(toUser, event)
  }

  let entity = new Transfer(
    event.transaction.hash.concatI32(event.logIndex.toI32())
  )
  if (fromUser != null) {
    entity.from = fromAddress
  }
  if (toUser != null) {
    entity.to = toAddress
  }
  entity.value = value

  entity.blockNumber = event.block.number
  entity.blockTimestamp = event.block.timestamp
  entity.transactionHash = event.transaction.hash

  entity.save()
}
