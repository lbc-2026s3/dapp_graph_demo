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
import { Approval, Transfer, User } from "../generated/schema"

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

  // 自己转给自己时必须共用同一个对象。两边各 load 一次时，第二次还读不到未 save 的余额。
  let fromUser = getOrCreateUser(fromAddress)
  let toUser = fromAddress.equals(toAddress)
    ? fromUser
    : getOrCreateUser(toAddress)

  let zero = Address.zero()
  if (!fromAddress.equals(zero)) {
    fromUser.balance = fromUser.balance.minus(value)
  }
  if (!toAddress.equals(zero)) {
    toUser.balance = toUser.balance.plus(value)
  }

  fromUser.save()
  if (!fromAddress.equals(toAddress)) {
    toUser.save()
  }

  let entity = new Transfer(
    event.transaction.hash.concatI32(event.logIndex.toI32())
  )
  entity.from = fromAddress
  entity.to = toAddress
  entity.value = value

  entity.blockNumber = event.block.number
  entity.blockTimestamp = event.block.timestamp
  entity.transactionHash = event.transaction.hash

  entity.save()
}
