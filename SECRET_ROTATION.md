# NorteShopMoz - Secret Rotation Guide

## 🔐 Secrets Inventory

| Secret | Rotation Frequency | Last Rotated | Next Rotation | Status |
|--------|-------------------|--------------|---------------|--------|
| JWT_SECRET | 90 dias | 2026-08-25 (local) | 2026-11-23 | ✅ Ativo |
| DB_PASSWORD | 90 dias | 2026-08-25 | 2026-11-23 | ✅ Ativo |
| REDIS_PASSWORD | 90 dias | 2026-08-25 | 2026-11-23 | ✅ Ativo |
| RESEND_API_KEY | 180 dias | - | - | ⚠️ Pendente (exige console Resend) |
| CLOUDINARY_API_SECRET | 180 dias | - | - | ⚠️ Pendente (exige console Cloudinary) |
| GOOGLE_CLIENT_SECRET | 180 dias | - | - | ⚠️ Pendente — `.env.prod` tem placeholder `YOUR_GOOGLE_CLIENT_SECRET_HERE`; login Google falha em prod até ser preenchido |
| FACEBOOK_APP_SECRET | 180 dias | - | - | ⚠️ Pendente (exige console Facebook Developers) |

> **Nota (2026-08-25):** o JWT_SECRET de produção foi rodado localmente com
> `openssl rand -base64 48` e atualizado no `.env.prod` — reinicie a API para
> invalidar sessões antigas. As chaves externas (Resend, Cloudinary, Google,
> Facebook) exigem rotação nos respetivos consoles — os valores atuais ficaram
> expostos em ficheiros versionados anteriormente e DEVEM ser considerados
> comprometidos.

## 🔄 Rotation Procedure

### 1. JWT_SECRET (Critical - Invalida todos os tokens ativos)

```bash
# 1. Gerar novo secret
NEW_JWT=$(openssl rand -base64 48)

# 2. Atualizar no gerenciador de segredos (AWS Secrets Manager / Vault / GitHub Secrets)
aws secretsmanager update-secret --secret-id norteshop/jwt-secret --secret-string "$NEW_JWT"

# 3. Deploy rolling restart (zero-downtime)
kubectl rollout restart deployment/norteshop-api -n production

# 3b. Docker Compose (se não usar k8s)
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --force-recreate api

# 4. Verificar saúde
curl -f https://api.norteshop.com/actuator/health
```

### 2. Database Password (Requer coordenação)

```bash
# 1. Gerar nova senha
NEW_DB_PASS=$(openssl rand -base64 24)

# 2. Atualizar no PostgreSQL
docker exec nsm-db psql -U postgres -c "ALTER USER norteshopmoz WITH PASSWORD '$NEW_DB_PASS';"

# 3. Atualizar no gerenciador de segredos
aws secretsmanager update-secret --secret-id norteshop/db-password --secret-string "$NEW_DB_PASS"

# 3b. Docker Compose
# Editar .env.prod e reiniciar
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --force-recreate api

# 4. Verificar
curl -f https://api.norteshop.com/actuator/health
```

### 3. Redis Password

```bash
# 1. Gerar nova senha
NEW_REDIS_PASS=$(openssl rand -base64 24)

# 2. Atualizar Redis (requer restart)
docker exec nsm-redis redis-cli ACL SETUSER default on ">$NEW_REDIS_PASS" ~* +@all

# 3. Atualizar segredo
aws secretsmanager update-secret --secret-id norteshop/redis-password --secret-string "$NEW_REDIS_PASS"

# 4. Reiniciar API
docker compose restart api
```

### 4. Chaves Externas (Resend, Cloudinary, OAuth)

```bash
# Resend
# 1. Console Resend > API Keys > Create new key
# 2. Atualizar
aws secretsmanager update-secret --secret-id norteshop/resend-api-key --secret-string "re_..."

# Cloudinary
# 1. Console Cloudinary > Security > Regenerate API Secret
aws secretsmanager update-secret --secret-id norteshop/cloudinary-secret --secret-string "..."

# Google OAuth
# 1. Google Cloud Console > Credentials > Regenerate secret
aws secretsmanager update-secret --secret-id norteshop/google-client-secret --secret-string "..."

# Facebook
# 1. Facebook Developers > Settings > Basic > Reset App Secret
aws secretsmanager update-secret --secret-id norteshop/facebook-app-secret --secret-string "..."
```

## 📅 Agendamento Automatizado (AWS EventBridge + Lambda)

```yaml
# EventBridge Rule (cron 0 2 1 * ? *) - todo dia 1 às 02:00
# Target: Lambda function rotate-secrets
```

```python
# Lambda rotation function (pseudocode)
import boto3
import secrets
import base64

def rotate_jwt_secret():
    client = boto3.client('secretsmanager')
    new_secret = base64.b64encode(secrets.token_bytes(32)).decode()
    client.update_secret(SecretId='norteshop/jwt-secret', SecretString=new_secret)
    # Trigger deployment via webhook/EventBridge

def rotate_db_password():
    # More complex - requires DB update + secret update + rolling restart
    pass
```

## 🚨 Checklist de Rotação

- [ ] Agendar janela de manutenção (baixo tráfego)
- [ ] Comunicar equipe (Slack/email)
- [ ] Backup do banco atual
- [ ] Executar rotação
- [ ] Verificar health checks
- [ ] Testar login/registro
- [ ] Verificar logs de erro
- [ ] Atualizar documentação (data/próxima rotação)
- [ ] Notificar equipe conclusão

## 🚨 Emergência - Comprometimento de Segredo

```bash
# ROTAÇÃO IMEDIATA (tempo real)
# 1. Revogar segredo comprometido IMEDIATAMENTE
# 2. Gerar novo segredo
# 3. Atualizar em TODOS os locais (produção, staging, CI/CD)
# 4. Invalidar sessões ativas (JWT: deploy novo secret)
# 5. Forçar logout de usuários (opcional)
# 6. Auditoria de acesso suspeito nos logs
```

## 📋 Auditoria

| Secret | Última Rotação | Próxima | Responsável | Observações |
|--------|----------------|---------|-------------|-------------|
| JWT_SECRET | 2026-08-25 | 2026-11-23 | DevOps | Primeira rotação |
| DB_PASSWORD | 2026-08-25 | 2026-11-23 | DevOps | Primeira rotação |
| REDIS_PASSWORD | 2026-08-25 | 2026-11-23 | DevOps | Primeira rotação |

---

## 📁 Onde os Segredos Estão Armazenados

| Ambiente | Método | Localização |
|----------|--------|-------------|
| Produção | AWS Secrets Manager | `norteshop/*` |
| Staging | GitHub Environments | Repository Settings > Environments |
| CI/CD | GitHub Secrets | Repository Settings > Secrets |
| Local/Dev | `.env.local` (gitignored) | `.env`, `.env.prod` (gitignored) |

## 🔐 Boas Práticas

1. **NUNCA** commit segredos no Git
2. Use **gerenciador de segredos** (AWS Secrets Manager, Vault, 1Password)
3. **Roteção automática** agendada
4. **Auditoria** mensal de acesso a segredos
5. **Rotação de emergência** documentada e testada
6. **Mínimo privilégio** - cada serviço só acessa o que precisa