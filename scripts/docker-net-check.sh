#!/usr/bin/env bash
# =============================================================================
# NorteShopMoz — Estado de rede dos contentores ("healthy" mas fora da rede)
#
# Porquê: quando o Docker não consegue programar uma porta publicada no arranque
# do contentor, devolve
#
#   failed to set up container networking: ... failed to bind host port
#   0.0.0.0:6381/tcp: address already in use
#
# e deixa o contentor A CORRER com o endpoint de rede revertido. Como o
# healthcheck corre DENTRO do contentor, continua "healthy" — e o serviço
# desaparece silenciosamente:
#   · o nome do serviço (ex.: `redis`) deixa de resolver-se para os vizinhos;
#   · a porta publicada fica fechada no host;
#   · o `docker compose ps` mostra tudo a correr.
# Numa loja de desenvolvimento isto traduziu-se em 12 h de respostas 500 em todos
# os pedidos (o rate limit por Redis corre antes de tudo) sem nenhum sinal
# visível fora do `docker logs`.
#
# Uso:
#   ./scripts/docker-net-check.sh                    # verifica (docker-compose.yml)
#   ./scripts/docker-net-check.sh --fix              # reconecta com o alias em falta
#   ./scripts/docker-net-check.sh --preflight        # antes de 'up': portas livres?
#   ./scripts/docker-net-check.sh -f docker-compose.prod.yml
#
# Variáveis: COMPOSE_FILE (omissão ./docker-compose.yml), PROJECT (nome do
# projeto; por omissão o do compose).
#
# Saída: 0 = tudo em ordem; 1 = há problemas (ou houve, e o --fix não os resolveu).
# =============================================================================

set -uo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

COMPOSE_FILE="${COMPOSE_FILE:-./docker-compose.yml}"
PROJECT="${PROJECT:-}"
FIX=0
PREFLIGHT=0
FAILED=0
FIXED=0

ok()   { echo -e "  \033[0;32m✔\033[0m $1"; }
bad()  { echo -e "  \033[0;31m✘\033[0m $1"; FAILED=1; }
warn() { echo -e "  \033[0;33m!\033[0m $1"; }
info() { echo -e "  \033[0;36m·\033[0m $1"; }

usage() {
    sed -nE '2,30s/^# ?//p' "$0"
}

while (($#)); do
    case "$1" in
        --fix) FIX=1 ;;
        --preflight) PREFLIGHT=1 ;;
        -f|--file) COMPOSE_FILE="${2:?falta o ficheiro do compose}"; shift ;;
        -p|--project) PROJECT="${2:?falta o nome do projeto}"; shift ;;
        -h|--help) usage; exit 0 ;;
        *) echo "Opção desconhecida: $1 (use --help)" >&2; exit 2 ;;
    esac
    shift
done

if [[ ! -f "$COMPOSE_FILE" ]]; then
    echo "Ficheiro do compose não encontrado: $COMPOSE_FILE" >&2
    exit 2
fi

command -v docker >/dev/null 2>&1 || { echo "docker não está instalado/no PATH" >&2; exit 2; }

# ── Nome do projeto (para a rede <projeto>_default) ───────────────────────────
if [[ -z "$PROJECT" ]]; then
    if command -v python3 >/dev/null 2>&1; then
        PROJECT="$(docker compose -f "$COMPOSE_FILE" config --format json 2>/dev/null \
            | python3 -c 'import json,sys; print(json.load(sys.stdin).get("name",""))' 2>/dev/null)"
    fi
    if [[ -z "$PROJECT" ]]; then
        # O mesmo cálculo que o compose faz: pasta em minúsculas, sem caracteres
        # inválidos.
        PROJECT="$(basename "$(cd "$(dirname "$COMPOSE_FILE")" && pwd)" \
            | tr '[:upper:]' '[:lower:]' | sed -E 's/[^a-z0-9_-]//g')"
    fi
fi

# ── Portas publicadas no ficheiro (para o --preflight) ───────────────────────
host_ports_from_file() {
    sed -nE 's/^[[:space:]]*-[[:space:]]*"?([0-9]{1,3}(\.[0-9]{1,3}){3}:)?([0-9]{2,5}):([0-9]{2,5})"?.*/\3/p' \
        "$COMPOSE_FILE" | sort -u
}

listening() {
    local port="$1"
    if command -v ss >/dev/null 2>&1; then
        ss -ltn 2>/dev/null | grep -qE "[:.]${port}[[:space:]]"
    elif command -v netstat >/dev/null 2>&1; then
        netstat -ltn 2>/dev/null | grep -qE "[:.]${port}[[:space:]]"
    else
        return 0 # sem ferramenta de inspecção: não acusar falso positivo
    fi
}

attached_alias() {
    local cid="$1" net="$2" svc="$3"
    docker inspect -f \
        "{{range \$k, \$v := .NetworkSettings.Networks}}{{if eq \$k \"$net\"}}{{join \$v.Aliases \",\"}}{{end}}{{end}}" \
        "$cid" 2>/dev/null
}

# =============================================================================
# 1) Preflight: alguma porta do compose está ocupada por outro processo?
# =============================================================================
if (( PREFLIGHT )); then
    echo "1) Portas publicadas por $COMPOSE_FILE"
    mapfile -t ports < <(host_ports_from_file)
    if ((${#ports[@]} == 0)); then
        info "nenhuma porta publicada neste ficheiro (tudo interno à rede do Docker)"
    fi
    for port in ${ports[@]+"${ports[@]}"}; do
        # Quem publica a porta, com o projeto de origem. Um contentor de OUTRO
        # projeto não conta como "nossa": o Docker não partilha portas de host
        # entre contentores, pelo que o segundo a tentar ficaria SEM rede (o
        # estado silencioso que este script existe para evitar). Antes, qualquer
        # dono era aceite com um ✔ — falso negativo.
        owners="$(docker ps --filter "publish=$port" \
            --format '{{.Names}}␟{{.Label "com.docker.compose.project"}}' 2>/dev/null)"
        ours=""
        foreign=""
        while IFS= read -r line; do
            [[ -z "$line" ]] && continue
            name="${line%%␟*}"
            owner_project="${line#*␟}"
            if [[ -z "$owner_project" || "$owner_project" == "$PROJECT" ]]; then
                ours+="$name "
            else
                foreign+="$name (projeto $owner_project) "
            fi
        done <<<"$owners"

        if [[ -n "$foreign" ]]; then
            bad "porta $port JÁ ocupada por outro stack: ${foreign% } — o nosso contentor vai arrancar SEM rede e sem porta"
            info "pare esse stack (ou mude a porta em $COMPOSE_FILE) e repita o 'docker compose up -d'"
        elif [[ -n "$ours" ]]; then
            ok "porta $port publicada por este stack: ${ours% }"
        elif listening "$port"; then
            bad "porta $port JÁ ocupada por outro processo — o contentor vai arrancar SEM rede e sem porta"
            info "veja quem a ocupa:  sudo ss -ltnp | grep ':$port'   ou   sudo lsof -i :$port"
            info "pare/mude esse processo e repita o 'docker compose up -d'"
        else
            ok "porta $port livre"
        fi
    done
    echo
    if (( FAILED )); then
        echo -e "\033[0;31mPreflight falhou: corrija as portas antes do 'docker compose up -d'.\033[0m"
        exit 1
    fi
    echo -e "\033[0;32mPreflight OK: as portas publicadas estão livres ou já pertencem a este stack.\033[0m"
    exit 0
fi

# =============================================================================
# 2) Contentores do projeto: ligados à rede, com alias, e com as portas abertas?
# =============================================================================
echo "Projeto '$PROJECT' — ficheiro $COMPOSE_FILE"

mapfile -t containers < <(docker ps -a \
    --filter "label=com.docker.compose.project=$PROJECT" \
    --format '{{.ID}}|{{.Names}}|{{.State}}|{{.Label "com.docker.compose.service"}}')

if ((${#containers[@]} == 0)); then
    warn "nenhum contentor do projeto '$PROJECT' encontrado (stack desligada?)"
    echo "  Suba a infraestrutura:  docker compose -f $COMPOSE_FILE up -d"
    exit 1
fi

for line in "${containers[@]}"; do
    IFS='|' read -r cid cname state svc <<<"$line"
    echo
    echo "— $cname (serviço '$svc', $state)"

    if [[ "$state" != "running" ]]; then
        warn "contentor parado — arranque com: docker compose -f $COMPOSE_FILE up -d $svc"
        continue
    fi

    netmode="$(docker inspect -f '{{.HostConfig.NetworkMode}}' "$cid" 2>/dev/null)"
    case "$netmode" in
        default) net="${PROJECT}_default" ;;
        *)       net="$netmode" ;;
    esac

    networks="$(docker inspect -f '{{json .NetworkSettings.Networks}}' "$cid" 2>/dev/null)"
    attached="$(docker inspect -f "{{if index .NetworkSettings.Networks \"$net\"}}sim{{else}}nao{{end}}" "$cid" 2>/dev/null)"

    if [[ "$networks" == "{}" || "$networks" == "null" || -z "$networks" ]]; then
        bad "sem endpoint de rede (o nome '$svc' não se resolve para os vizinhos)"
        if (( FIX )); then
            if docker network connect --alias "$svc" "$net" "$cid" >/dev/null 2>&1; then
                ok "reconectado a '$net' com o alias '$svc'"
                FIXED=$((FIXED + 1))
            else
                bad "falha ao reconectar: o contentor pode precisar de recriação (--force-recreate)"
            fi
        else
            info "corrija com:  $0 --fix   (ou docker network connect --alias $svc $net $cname)"
        fi
    elif [[ "$attached" != "sim" ]]; then
        # Ligado a outra rede (cabeçalho diferente do esperado) — só avisa.
        warn "não está ligado a '$net' (redes atuais: $networks)"
    else
        aliases="$(attached_alias "$cid" "$net" "$svc")"
        if [[ ",$aliases," == *",$svc,"* ]]; then
            ok "ligado a '$net' com o alias '$svc'"
        else
            bad "ligado a '$net' SEM o alias '$svc' (aliases: ${aliases:-nenhum}): o nome não resolve para os vizinhos"
            if (( FIX )); then
                if docker network disconnect "$net" "$cid" >/dev/null 2>&1 \
                        && docker network connect --alias "$svc" "$net" "$cid" >/dev/null 2>&1; then
                    ok "reconectado com o alias '$svc'"
                    FIXED=$((FIXED + 1))
                else
                    bad "falha ao reconectar: recrie o contentor (--force-recreate)"
                fi
            else
                info "corrija com:  $0 --fix"
            fi
        fi
    fi

    # Portas publicadas: o mapeamento pode existir e não estar escutado — foi
    # exactamente o caso do Redis (6381 fechado no host, contentor "healthy").
    mapfile -t hostports < <(docker inspect -f \
        '{{range $p, $conf := .HostConfig.PortBindings}}{{$p}}={{range $conf}}{{.HostPort}} {{end}}{{end}}' \
        "$cid" 2>/dev/null | sed -E 's#^[^=]*=##; s/ /\n/g' | grep -E '^[0-9]+$')
    for hostport in ${hostports[@]+"${hostports[@]}"}; do
        if listening "$hostport"; then
            ok "porta de host $hostport a escutar"
        else
            bad "porta de host $hostport FECHADA (mapeamento existe, ninguém escuta)"
            info "recrie o serviço:  docker compose -f $COMPOSE_FILE up -d --force-recreate $svc"
        fi
    done
done

echo
if (( FAILED )); then
    if (( FIXED )); then
        echo -e "\033[0;33mForam corrigidos $FIXED contentor(es) — reexecute sem --fix para confirmar.\033[0m"
        exit 1
    fi
    echo -e "\033[0;31mForam encontrados contentores fora da rede ou com portas fechadas.\033[0m"
    echo "  Corrija:  $0 --fix     ou:  docker compose -f $COMPOSE_FILE up -d --force-recreate <serviço>"
    exit 1
fi
echo -e "\033[0;32mRede e portas dos contentores: tudo em ordem.\033[0m"
