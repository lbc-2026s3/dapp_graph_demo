# dapp_graph_demo

The Graph subgraph，索引 Sepolia 上 [UPT26](https://sepolia.etherscan.io/address/0xc9423ee04f2afa3a4f73fa5a21427543a7a5edbe) 合约的 `Approval` 和 `Transfer` 事件，并根据转账维护每个地址的余额和转入/转出记录。

| 项 | 值 |
| --- | --- |
| 网络 | `sepolia` |
| 合约 | `0xc9423ee04f2afa3a4f73fa5a21427543a7a5edbe` |
| 起始区块 | `10663818` |

合约地址和起始区块写在 `subgraph.yaml` 与 `networks.json`。事件处理在 `src/upt-26.ts`，实体定义在 `schema.graphql`。

## 环境

- Node.js 18+
- [Yarn](https://yarnpkg.com/)
- [Docker](https://docs.docker.com/get-docker/)（单元测试和本地节点需要）

## 安装

```bash
yarn
```

`@graphprotocol/graph-cli` 装在项目依赖里，下面的 `yarn` 脚本会直接调用它。

## 生成代码

修改 `schema.graphql`、`subgraph.yaml` 或 `abis/UPT26.json` 之后，先生成 AssemblyScript 类型。`generated/` 不入库，克隆仓库后也要跑一次。

```bash
yarn codegen
```

## 编译

```bash
yarn build
```

产物在 `build/`（WASM 和编译后的 manifest），该目录已加入 `.gitignore`。

## 测试

用 [Matchstick](https://thegraph.com/docs/en/subgraphs/developing/creating/unit-testing-framework/) 跑 `tests/` 下的单元测试。测试会拉 Docker 镜像，本机需要先启动 Docker。

```bash
yarn test
```

## 部署到 The Graph Studio

1. 在 [Subgraph Studio](https://thegraph.com/studio/) 创建 subgraph，slug 为 `dapp_graph_demo`。
2. 用 Studio 里的 Deploy Key 登录：

```bash
yarn graph auth --studio <DEPLOY_KEY>
```

3. 部署：

```bash
yarn deploy
```

当前已部署版本的查询地址：

```text
https://api.studio.thegraph.com/query/1762815/dapp_graph_demo/version/latest
```

Studio 页面：<https://thegraph.com/studio/subgraph/dapp_graph_demo>

若 subgraph 未公开，请求需要带 API Key：

```bash
curl -X POST \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <API_KEY>" \
  -d '{"query":"{ users(first: 5, orderBy: balance, orderDirection: desc) { id balance } transfers(first: 5) { id from { id } to { id } value } }"}' \
  https://api.studio.thegraph.com/query/1762815/dapp_graph_demo/version/latest
```

## 部署到本地节点

`docker-compose.yml` 里的网络名必须和 `subgraph.yaml` 的 `network` 一致。当前 manifest 是 `sepolia`，把 `graph-node` 的 `ethereum` 改成 Sepolia RPC，例如：

```yaml
ethereum: "sepolia:https://sepolia.infura.io/v3/<INFURA_KEY>"
```

然后启动节点、创建并部署 subgraph：

```bash
docker compose up -d
yarn create-local
yarn deploy-local
```

本地查询：

```text
http://localhost:8000/subgraphs/name/dapp_graph_demo
```

索引状态：<http://localhost:8030/graphql>

删除本地 subgraph：

```bash
yarn remove-local
```

Postgres 和 IPFS 数据写在 `./data/`。改合约地址或起始区块后，先 `yarn remove-local`，再重新 `yarn deploy-local`，否则旧索引会留下来。

## 查询示例

```graphql
{
  approvals(first: 5, orderBy: blockNumber, orderDirection: desc) {
    id
    owner
    spender
    value
    blockNumber
    transactionHash
  }
  users(first: 5, orderBy: balance, orderDirection: desc) {
    id
    balance
    sentTransfers(first: 5, orderBy: blockNumber, orderDirection: desc) {
      id
      to { id }
      value
      blockNumber
      transactionHash
    }
    receivedTransfers(first: 5, orderBy: blockNumber, orderDirection: desc) {
      id
      from { id }
      value
      blockNumber
      transactionHash
    }
  }
  transfers(first: 5, orderBy: blockNumber, orderDirection: desc) {
    id
    from { id }
    to { id }
    value
    blockNumber
    transactionHash
  }
}
```
