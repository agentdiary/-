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

## 云端启动

当前云主机 API:

```text
http://43.130.127.226
```

健康检查:

```text
http://43.130.127.226/health
```

服务用 user-level systemd 管理,配置见 `deploy/agentdiary-api.service`。

## LLM 接入(当前:Ollama)

推理走 Ollama(`app/llm.py`),默认 `http://localhost:11434` + `qwen3.5:9b`,
可用环境变量 `OLLAMA_URL` / `OLLAMA_MODEL` 覆盖。**启动后端前先确保 Ollama 在运行。**

- 写日记 → FastAPI BackgroundTasks 后台蒸馏(逆向构造对话对 + 抽取人格卡片),
  本地 9B 推理一篇约 30~90 秒,完成后卡片才会出现
- 化身对话 → 按新近度检索人格卡片注入 system prompt 生成回应

## 待接入(按 CLAUDE.md §2)

- 人格卡片向量检索(现为新近度排序)+ 断言覆盖机制
- 对话对喂给 LoRA 微调;DPO 校准环
- 蒸馏/训练任务升级为正式队列
- 存储加密
