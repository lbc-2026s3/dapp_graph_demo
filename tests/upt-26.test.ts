import {
  assert,
  describe,
  test,
  clearStore,
  beforeAll,
  afterAll
} from "matchstick-as/assembly/index"
import { Address, BigInt, Bytes } from "@graphprotocol/graph-ts"
import { Approval } from "../generated/schema"
import { Approval as ApprovalEvent } from "../generated/UPT26/UPT26"
import { handleApproval, handleTransfer } from "../src/upt-26"
import { createApprovalEvent, createTransferEvent } from "./upt-26-utils"

// Tests structure (matchstick-as >=0.5.0)
// https://thegraph.com/docs/en/subgraphs/developing/creating/unit-testing-framework/#tests-structure

describe("Describe entity assertions", () => {
  beforeAll(() => {
    let owner = Address.fromString("0x0000000000000000000000000000000000000001")
    let spender = Address.fromString(
      "0x0000000000000000000000000000000000000001"
    )
    let value = BigInt.fromI32(234)
    let newApprovalEvent = createApprovalEvent(owner, spender, value)
    handleApproval(newApprovalEvent)
  })

  afterAll(() => {
    clearStore()
  })

  // For more test scenarios, see:
  // https://thegraph.com/docs/en/subgraphs/developing/creating/unit-testing-framework/#write-a-unit-test

  test("Approval created and stored", () => {
    assert.entityCount("Approval", 1)

    // 0xa16081f360e3847006db660bae1c6d1b2e17ec2a is the default address used in newMockEvent() function
    assert.fieldEquals(
      "Approval",
      "0xa16081f360e3847006db660bae1c6d1b2e17ec2a-1",
      "owner",
      "0x0000000000000000000000000000000000000001"
    )
    assert.fieldEquals(
      "Approval",
      "0xa16081f360e3847006db660bae1c6d1b2e17ec2a-1",
      "spender",
      "0x0000000000000000000000000000000000000001"
    )
    assert.fieldEquals(
      "Approval",
      "0xa16081f360e3847006db660bae1c6d1b2e17ec2a-1",
      "value",
      "234"
    )

    // More assert options:
    // https://thegraph.com/docs/en/subgraphs/developing/creating/unit-testing-framework/#asserts
  })
})

describe("User balances and transfers", () => {
  afterAll(() => {
    clearStore()
  })

  test("mint credits only the recipient", () => {
    clearStore()
    let zero = Address.zero()
    let alice = Address.fromString(
      "0x0000000000000000000000000000000000000001"
    )
    handleTransfer(
      createTransferEvent(zero, alice, BigInt.fromI32(1000), 1)
    )

    assert.entityCount("Transfer", 1)
    assert.entityCount("User", 1)
    assert.notInStore(
      "User",
      "0x0000000000000000000000000000000000000000"
    )
    assert.fieldEquals(
      "User",
      "0x0000000000000000000000000000000000000001",
      "balance",
      "1000"
    )
  })

  test("transfer moves balance and a later transfer accumulates", () => {
    clearStore()
    let alice = Address.fromString(
      "0x0000000000000000000000000000000000000001"
    )
    let bob = Address.fromString(
      "0x0000000000000000000000000000000000000002"
    )
    handleTransfer(
      createTransferEvent(Address.zero(), alice, BigInt.fromI32(1000), 1)
    )
    handleTransfer(createTransferEvent(alice, bob, BigInt.fromI32(400), 2))
    handleTransfer(createTransferEvent(alice, bob, BigInt.fromI32(100), 3))

    assert.entityCount("Transfer", 3)
    assert.entityCount("User", 2)
    assert.fieldEquals(
      "User",
      "0x0000000000000000000000000000000000000001",
      "balance",
      "500"
    )
    assert.fieldEquals(
      "User",
      "0x0000000000000000000000000000000000000002",
      "balance",
      "500"
    )
    assert.fieldEquals(
      "Transfer",
      "0xa16081f360e3847006db660bae1c6d1b2e17ec2a-2",
      "from",
      "0x0000000000000000000000000000000000000001"
    )
    assert.fieldEquals(
      "Transfer",
      "0xa16081f360e3847006db660bae1c6d1b2e17ec2a-2",
      "to",
      "0x0000000000000000000000000000000000000002"
    )
    assert.fieldEquals(
      "Transfer",
      "0xa16081f360e3847006db660bae1c6d1b2e17ec2a-2",
      "value",
      "400"
    )
  })

  test("burn debits only the sender", () => {
    clearStore()
    let alice = Address.fromString(
      "0x0000000000000000000000000000000000000001"
    )
    handleTransfer(
      createTransferEvent(Address.zero(), alice, BigInt.fromI32(1000), 1)
    )
    handleTransfer(
      createTransferEvent(alice, Address.zero(), BigInt.fromI32(250), 2)
    )

    assert.entityCount("User", 1)
    assert.notInStore(
      "User",
      "0x0000000000000000000000000000000000000000"
    )
    assert.fieldEquals(
      "User",
      "0x0000000000000000000000000000000000000001",
      "balance",
      "750"
    )
  })

  test("self transfer keeps the balance", () => {
    clearStore()
    let alice = Address.fromString(
      "0x0000000000000000000000000000000000000001"
    )
    handleTransfer(
      createTransferEvent(Address.zero(), alice, BigInt.fromI32(1000), 1)
    )
    handleTransfer(createTransferEvent(alice, alice, BigInt.fromI32(1000), 2))

    assert.entityCount("User", 1)
    assert.fieldEquals(
      "User",
      "0x0000000000000000000000000000000000000001",
      "balance",
      "1000"
    )
  })

  test("snapshots keep the balance after each block", () => {
    clearStore()
    let alice = Address.fromString(
      "0x0000000000000000000000000000000000000001"
    )
    let bob = Address.fromString(
      "0x0000000000000000000000000000000000000002"
    )
    let txHash = Bytes.fromHexString(
      "0xa16081f360e3847006db660bae1c6d1b2e17ec2a"
    )

    let mint = createTransferEvent(
      Address.zero(),
      alice,
      BigInt.fromI32(1000),
      1
    )
    mint.block.number = BigInt.fromI32(10)
    handleTransfer(mint)

    let firstSend = createTransferEvent(alice, bob, BigInt.fromI32(100), 2)
    firstSend.block.number = BigInt.fromI32(20)
    handleTransfer(firstSend)

    let secondSend = createTransferEvent(alice, bob, BigInt.fromI32(50), 3)
    secondSend.block.number = BigInt.fromI32(20)
    handleTransfer(secondSend)

    assert.entityCount("BalanceSnapshot", 5)
    assert.fieldEquals(
      "BalanceSnapshot",
      txHash.concatI32(1).concat(alice).toHexString(),
      "balance",
      "1000"
    )
    assert.fieldEquals(
      "BalanceSnapshot",
      txHash.concatI32(1).concat(alice).toHexString(),
      "blockNumber",
      "10"
    )
    assert.fieldEquals(
      "BalanceSnapshot",
      txHash.concatI32(2).concat(alice).toHexString(),
      "balance",
      "900"
    )
    assert.fieldEquals(
      "BalanceSnapshot",
      txHash.concatI32(3).concat(alice).toHexString(),
      "balance",
      "850"
    )
    assert.fieldEquals(
      "BalanceSnapshot",
      txHash.concatI32(3).concat(alice).toHexString(),
      "blockNumber",
      "20"
    )
    assert.fieldEquals(
      "BalanceSnapshot",
      txHash.concatI32(3).concat(bob).toHexString(),
      "balance",
      "150"
    )
    assert.fieldEquals(
      "BalanceSnapshot",
      txHash.concatI32(2).concat(alice).toHexString(),
      "sortKey",
      BigInt.fromI32(20)
        .times(BigInt.fromString("4294967296"))
        .plus(BigInt.fromI32(2))
        .toString()
    )
    assert.fieldEquals(
      "BalanceSnapshot",
      txHash.concatI32(3).concat(alice).toHexString(),
      "sortKey",
      BigInt.fromI32(20)
        .times(BigInt.fromString("4294967296"))
        .plus(BigInt.fromI32(3))
        .toString()
    )
  })
})
