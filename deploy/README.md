# 云端部署(Ubuntu 24.04)

生产后端跑在腾讯云 Ubuntu 上,FastAPI 由 systemd 托管,nginx 反代 80 端口。

| 项 | 值 |
|---|---|
| 公网地址 | `https://43.130.127.226.sslip.io`(443 待放行)/ `http://43.130.127.226` |
| 健康检查 | `/health` |
| 证书 | Let's Encrypt,ECDSA,`certbot.timer` 自动续期(续期演练已验证) |
| 域名 | sslip.io 免费泛解析:`<IP>.sslip.io` 直接解析到该 IP,无需注册。**服务器 IP 变了域名要跟着变,证书也要重签** |
| 代码目录 | `/home/ubuntu/agentdiary` |
| **数据目录** | `/var/lib/agentdiary`(DB + 头像,**在代码目录之外**) |
| 环境变量 | `/etc/agentdiary.env`(root:root 600,含 API Key,不入库) |
| SSH | `ssh agentdiary`(见本机 `~/.ssh/config`) |

## 本目录文件

- `agentdiary-api.service` → 部署到 `/etc/systemd/system/`
- `nginx-agentdiary.conf` → 部署到 `/etc/nginx/sites-available/agentdiary`,并软链到 `sites-enabled/default`
- `agentdiary.env.example` → 复制到 `/etc/agentdiary.env` 后填入真实 `DASHSCOPE_API_KEY`

## 常用命令

```bash
sudo systemctl status agentdiary-api
sudo systemctl restart agentdiary-api
sudo journalctl -u agentdiary-api -n 100 --no-pager
```

## 三条不能动的约束

1. **绝不加 `--workers`**。SQLite 写并发、`ratelimit.py` 的进程内计数、
   蒸馏用的 BackgroundTasks,三样都依赖单进程。
2. **uvicorn 只绑 `127.0.0.1`**。公网入口只能是 nginx,8000 不对外。
3. **nginx `client_max_body_size` 不低于 12m**。头像上限 8MB 且走 base64
   传输(膨胀 1.33 倍),默认 1m 会直接 413。

`proxy_read_timeout 300s` 同理:蒸馏和化身对话都是长请求,默认 60s 会截断。

## 云防火墙

腾讯云轻量应用服务器的防火墙在**实例之外**,虚拟机内的 iptables / ufw 看不到也
改不了。放行清单必须在控制台维护,当前:`22 / 80 / 443 / ICMP`。

排查要点:如果 nginx 在监听但外网连不上,先怀疑这里——服务器本机 curl 能通、
外网不通,基本就是安全组没放行。

## 一个踩过的坑:certbot --redirect

`certbot --nginx --redirect` 自动加的跳转是按 `server_name` 匹配的,**裸 IP 访问
会落不到任何 server 块而返回 404**——症状和「反代挂了」一模一样,极易误判。

它在 443 尚未放行时更致命:HTTP 跳到连不上的 HTTPS,等于整个服务下线。

正确顺序:**先开 443 → 验证 HTTPS 公网可达 → 再加跳转**。现在的配置里跳转目标
写死成域名(不是 `$host`),所以裸 IP 访问也能正确跳到有证书的域名上。

`/.well-known/acme-challenge/` 在 80 上单独放行,否则续期会被跳转挡掉。
续期演练在跳转开启后已验证通过。
