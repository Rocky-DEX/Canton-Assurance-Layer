# 部署 Canton Assurance Layer

[English](DEPLOY.md) | 简体中文

一台机器、Docker 一条命令：Postgres、签名服务、控制台，以及可选的交易模拟器。
不会向 Rocky 或任何云服务发起连接。密钥留在你机器上的 volume 里，用你自己生成的
密钥加密。

你要部署的东西：

| 容器 | 作用 | 端口 |
|---|---|---|
| `db` | Postgres 17：机构、成员、按签名原样存储的文档 | 内部 |
| `service` | 签名服务（`rust/solvency-service`）：唯一持有签名种子的进程；构建树、签署报告、写证明 | 内部 8790 |
| `web` | 控制台（`web/`）：发布方工作台、客户门户、审计工作台、公开透明页 | 3000 |
| `simulator` | 可选（`rust/sim-server`）：模拟器页面背后的服务；需要一个 Canton participant | 8787 |

## 1. 前置条件

- 一台 Linux 主机（试用的话 Mac 也行），装好 **Docker 24+** 和 `docker compose` 插件。
  2 核 4 GB 足够；首次构建要编译 Rust 和 Next.js，小机器上需要 10–20 分钟。
- 如果除了你还有别人要用，需要一个指向这台主机的域名，登录链接会发到这个域名。
- 一个用于发送登录邮件的 SMTP 账号——或者先用第 4 步的日志方式引导，之后再配 SMTP。

## 2. 配置

```bash
git clone https://github.com/Rocky-DEX/Canton-Assurance-Layer.git
cd Canton-Assurance-Layer
cp .env.compose.example .env
```

填写 `.env`。密钥要用命令生成，不要自己编：

```bash
openssl rand -hex 32        # -> SERVICE_KEK      （必须是 64 个十六进制字符）
openssl rand -base64 48     # -> SERVICE_TOKEN    （再跑两次，给 AUTH_SECRET 和 POSTGRES_PASSWORD）
```

| 变量 | 含义 |
|---|---|
| `POSTGRES_PASSWORD` | 数据库密码，只有容器之间可见 |
| `SERVICE_TOKEN` | 控制台与签名服务之间的共享密钥，32 字符以上 |
| `SERVICE_KEK` | 加密每个机构签名种子的密钥。**务必备份。丢了它，已有的种子就打不开了** |
| `AUTH_SECRET` | 签名会话 cookie |
| `AUTH_URL` | 控制台的公网地址，如 `https://assurance.example.com`，登录链接指向这里 |
| `WEB_PORT` | 控制台在主机上的端口（默认 3000） |
| `EMAIL_SERVER`、`EMAIL_FROM` | 发送登录链接的 SMTP，如 `smtp://user:pass@smtp.example.com:587` |
| `MAGIC_LINK_LOG` | 设为 `1` 时登录链接打印到 `web` 容器日志而不发邮件（仅用于引导，见第 4 步） |
| `CANTON_SIM_*` | 仅 simulator profile 需要：participant 的 JSON Ledger API 地址和一个只读 token |

控制台启动时会检查这个文件，缺值或占位值会拒绝启动，`docker compose logs web`
里的信息会直接点名是哪个变量。

## 3. 启动

```bash
docker compose up -d --build
docker compose ps                 # 大约一分钟后三个容器都是 healthy
curl -s localhost:3000/api/health # {"status":"ok","db":"ok","signingService":"ok",...}
```

数据库迁移在 `web` 容器启动时自动执行。

## 4. 第一次登录

控制台没有管理员密码。每个账号都通过发到邮箱的链接登录，第一个创建机构的人就是
该机构的所有者。

**已配置 SMTP：** 打开 `http://<host>:3000/login`，输入邮箱，点邮件里的链接。

**还没有 SMTP：** 在 `.env` 里设 `MAGIC_LINK_LOG=1`，执行 `docker compose up -d web`，
在 `/login` 请求链接，然后：

```bash
docker compose logs web | grep "magic link"
```

打开打印出来的地址。能读到这份日志的人都能以任何身份登录，所以在邀请其他人之前，
去掉 `MAGIC_LINK_LOG` 并配置好 `EMAIL_SERVER`。

然后：**创建机构** → 名称、URL 别名、发布用的 Canton party。概览页的上手清单会带你
完成第一次发布；它链接的示例文件足够把每个界面走一遍，之后再准备真实文件。

## 5. 放到 TLS 后面

控制台只应通过带 TLS 的反向代理对外提供；会话 cookie 和登录链接不能明文传输。
用 [Caddy](https://caddyserver.com/) 的话，全部配置就是：

```
assurance.example.com {
    reverse_proxy localhost:3000
}
```

把 `AUTH_URL` 设为 `https://assurance.example.com`；如果希望 3000 端口只绑本机，
把 `docker-compose.yml` 里的端口改成 `127.0.0.1:3000:3000`。签名服务和数据库从不
对外暴露，只有 `web` 容器与它们通信。

## 6. 备份

三样东西，第三样最容易被忘：

| 什么 | 在哪 | 怎么做 |
|---|---|---|
| 数据库 | volume `db-data` | `docker compose exec db pg_dump -U canton canton > backup.sql` |
| 加密后的签名种子 | volume `keystore` | `docker run --rm -v canton-assurance-layer_keystore:/k -v "$PWD":/out alpine tar czf /out/keystore.tgz -C /k .` |
| 打开它们的密钥 | `.env` 里的 `SERVICE_KEK` | 放在你存放机密的地方，和 keystore 备份分开保存 |

**keystore 或 `SERVICE_KEK` 丢失后，机构就无法再签署新报告。** 已发布的一切永远可以
验证——公钥就在报告和锚里——但发布方必须启用新密钥，读者会在锚定历史里看到密钥
变更。这是有意的设计：密钥不能被悄悄替换，正是这套东西的意义。

恢复：重建 volume，`psql < backup.sql`，解压 keystore，把同一个 `SERVICE_KEK`
放回 `.env`，`docker compose up -d`。

### 恢复演练

没人恢复过的备份只是一个愿望。第一次部署之后、之后每个季度、以及每次改动 `.env`
之后，都跑一次演练：

```bash
docker compose exec db pg_dump -U canton canton > backup.sql
docker run --rm -v canton-assurance-layer_keystore:/k -v "$PWD":/out alpine tar czf /out/keystore.tgz -C /k .
scripts/restore-drill.sh --db backup.sql --keystore keystore.tgz --env-file .env
```

它会起一份隔离的第二副本（compose 项目 `cal-drill`，独立 volume，端口 3100），把
数据库转储和 keystore 恢复进去，检查行数与转储一致，以及最关键的一项：恢复后的签名
服务用你的 `SERVICE_KEK` 打开恢复的 keystore，能否复现每个机构记录在案的公钥。密钥
或归档不对时服务并不会报错，而是悄悄给每个机构生成一把新密钥，下一份报告就会用所有
读者都能看到变化的新密钥签署。演练以 `PASS` 结束，或者给出一行 `FAIL` 指出三项输入
中哪一项有问题，并清理它创建的一切（加 `--keep` 可保留检查）。在生产主机或任何有
Docker 和这三个文件的机器上运行都可以；它不会碰生产项目。

## 7. 升级

```bash
git pull
docker compose up -d --build
```

迁移在启动时执行。已发布的文档永远不会被改写：线格式的版本烙在每个哈希的域字符串
里，新版本与旧版本并存，从不替换（每个版本的 `CHANGELOG.md` 都会说明）。去年签的
报告今天照样能验证。

## 8. 模拟器（可选）

模拟器页面在 Canton participant 上对 Ledger API 命令做 dry-run。它需要 participant
的 JSON Ledger API 和一个**只读** token；从不提交，也不持有密钥。

```bash
# .env 中
CANTON_SIM_LEDGER_URL=https://validator.example/api/json-api
CANTON_SIM_TOKEN=...          # 或者用 CANTON_SIM_TOKEN_FILE 挂载文件
CANTON_SIM_SCAN_URL=https://scan.sv-1.global.canton.network.sync.global   # 实时费率

docker compose --profile simulator up -d --build
```

没有 participant 时，页面仍能解释错误码和预估费用；模拟结果会是「无法判定」。

## 9. 需要盯着的

- 控制台的 `GET /api/health`：`db`、`signingService`、`simulator` 各自是 `ok` 或
  `down`；控制台无法工作时返回 503。把你的可用性监控指向它。
- `docker compose ps`：healthcheck 本身不会重启任何东西，但 `restart: unless-stopped`
  会把崩溃的容器拉起来。
- 每个机构内部的审计日志（成员与 API 密钥变更、每次发布、托管和模拟调用）在数据库里，
  随数据库一起备份。

## 10. 排障

| 现象 | 原因 | 处理 |
|---|---|---|
| `web` 立即退出，日志有 `[config] error: …` | 必填变量缺失或是占位值 | 在 `.env` 设好点名的变量，`docker compose up -d web` |
| 收不到登录链接 | `EMAIL_SERVER` 错误或未设置 | 看 `docker compose logs web`；用 `MAGIC_LINK_LOG=1` 引导 |
| 登录链接打开的是错误的域名 | `AUTH_URL` 与浏览器地址不一致 | 设为公网地址，包含 `https://` |
| `/api/health` 里 `signingService: "down"` | 两个容器的 `SERVICE_TOKEN` 不一致，或 `SERVICE_KEK` 不是 64 位十六进制 | `docker compose logs service` 会说明是哪个 |
| 发布时报「ledger offset … moves backwards」 | 偏移量小于上一次发布 | 用「上一次 + 1」按钮，或填真实的更大偏移量 |
| 发布时报「signing key changed for …」 | 签名服务持有的这个机构的种子与记录在案的不同：keystore volume 或 `SERVICE_KEK` 丢失或恢复错误，服务生成了新密钥 | 这次没有发布任何内容。从备份恢复 keystore 和 `SERVICE_KEK` 并跑一次演练；除非确实要换密钥，否则不要带着新密钥继续 |
| 模拟器页面显示无法连接 | `simulator` profile 没启动，或 `CANTON_SIM_LEDGER_URL` 错误 | `docker compose --profile simulator up -d`；看它的日志 |

安全问题见 [SECURITY.md](SECURITY.md)；其他问题请到
[GitHub issues](https://github.com/Rocky-DEX/Canton-Assurance-Layer/issues)。
