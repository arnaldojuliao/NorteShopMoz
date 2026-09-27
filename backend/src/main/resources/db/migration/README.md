# Migrações de base de dados (Flyway)

O schema da API é gerido por **migrações versionadas** em SQL (Flyway). O
Hibernate **não** altera o schema — corre em `spring.jpa.hibernate.ddl-auto=validate`
e apenas confirma que as entidades correspondem às tabelas. Isto substitui o
antigo `ddl-auto=update`, que podia criar ou alterar colunas e índices em produção
sem revisão nem rollback.

## Ficheiros

- `V1__initial_schema.sql` — esquema inicial, gerado a partir das entidades JPA.
  É **idempotente** (`CREATE TABLE IF NOT EXISTS` e FKs protegidas) para poder
  ser aplicada tanto sobre uma base nova como sobre uma já existente criada pelo
  antigo `ddl-auto=update`.
- As alterações seguintes usam nomes incrementais: `V2__…sql`, `V3__…sql`, …

## Como adicionar uma migração

1. Crie `V<n>__descricao_curta.sql` (o número não pode repetir-se).
2. Escreva SQL **explícito** — sem depender do Hibernate.
3. Arranque a aplicação (ou corra a suite de testes): o Flyway aplica-a e, em
   seguida, o Hibernate valida o resultado. Um desvio entre entidades e schema
   falha o arranque, em vez de ser corrigido em silêncio.
4. Nunca edite uma migração já aplicada: cria uma nova.

## Bases de dados existentes

`baseline-on-migrate=true` + `baseline-version=0`: uma base de dados não vazia
sem histórico é marcada e a V1 (idempotente) corre por cima, criando apenas o
que faltar. Não é preciso `flyway baseline` manual.

> Em testes (`perfil unit-test`) o Flyway está desativado e o schema é criado a
> partir das entidades em H2 (`create-drop`), porque estas migrações são SQL de
> PostgreSQL.
