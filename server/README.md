# AgentDiary 后端(FastAPI)

Phase 0 骨架:日记 CRUD + 蒸馏 pipeline v1(占位)+ 化身自对话(占位)。

## 首次安装

```powershell
cd server
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

## 启动

```powershell
cd server
.venv\Scripts\Activate.ps1
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

`--host 0.0.0.0` 必须,否则 iPad 无法通过局域网访问。
交互式 API 文档:http://localhost:8000/docs

## 接口

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | /diaries | 日记列表 |
| POST | /diaries | 写日记(自动触发蒸馏 v1) |
| DELETE | /diaries/{id} | 删除日记(级联删除对话对与人格卡片) |
| POST | /chat | 与化身对话(占位回应) |
| GET | /persona-cards | 查看人格卡片(含出处) |
| GET | /health | 健康检查 |

## LLM 接入

`app/llm.py` 统一走 OpenAI 兼容协议(`/v1/chat/completions`)。千问百炼、Ollama、
vLLM 都实现这个协议,换模型只改环境变量,请求体不动。

分两套独立配置,因为两件活对模型的要求不同:

| 档 | 用在哪 | 该用什么 |
|---|---|---|
| `DISTILL` | 蒸馏抽卡片、构造对话对、AI 裁判 | 最强通用模型。产出训练素材,质量决定后续 LoRA 上限 |
| `CHAT` | 化身对话 | 现借通用模型跑通 Phase 0;将来换成自己 LoRA 微调的基座 |

**不设任何环境变量时全部回退到本地 Ollama**(`qwen3.5:9b`),原有开发流程照常,
只需确保 Ollama 在运行。切到千问百炼:

```powershell
# 用户级永久变量,设完要重开终端。API Key 绝不写进代码或 git
[Environment]::SetEnvironmentVariable("DASHSCOPE_API_KEY", "sk-...", "User")
[Environment]::SetEnvironmentVariable("DISTILL_BASE_URL", "https://dashscope.aliyuncs.com/compatible-mode/v1", "User")
[Environment]::SetEnvironmentVariable("DISTILL_MODEL", "qwen3.7-plus", "User")
[Environment]::SetEnvironmentVariable("CHAT_BASE_URL", "https://dashscope.aliyuncs.com/compatible-mode/v1", "User")
[Environment]::SetEnvironmentVariable("CHAT_MODEL", "qwen3.7-plus", "User")
```

服务器上则写进 systemd 的 `EnvironmentFile`(权限 600)。

`LLM_MONTHLY_TOKEN_BUDGET` 可选:设成月度 token 上限,超了拒绝调用。`ratelimit.py`
挡的是单人滥用,这个挡的是总量超支(20 个用户各聊 30 轮同样能烧穿预算)。
进程内计数、重启归零,真实对账看日志里每次调用的 `usage` 行。

- 写日记 → FastAPI BackgroundTasks 后台蒸馏(逆向构造对话对 + 抽取人格卡片),
  完成后卡片才会出现
- 化身对话 → 按新近度检索人格卡片注入 system prompt 生成回应

## 待接入(按 CLAUDE.md §2)

- 人格卡片向量检索(现为新近度排序)+ 断言覆盖机制
- 对话对喂给 LoRA 微调;DPO 校准环
- 蒸馏/训练任务升级为正式队列
- 存储加密
