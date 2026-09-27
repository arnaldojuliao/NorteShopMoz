-- V7 — tabela de locks distribuídos (ShedLock).
--
-- Motivo: as tarefas periódicas (@Scheduled) correm em CADA réplica da API. Com
-- mais de uma réplica, todas executam a manutenção, o expurgo de carrinhos e a
-- poda de chaves ao mesmo tempo — trabalho duplicado e contenção desnecessária na
-- base de dados. O ShedLock garante uma só execução por período através de uma
-- linha nesta tabela (o schema é o oficial do provider JDBC).
--
-- Idempotente: aplicável tanto a uma base nova como a uma existente.
-- A sonda de conectividade ao Redis NÃO usa este lock de propósito: cada réplica
-- tem de verificar a SUA própria ligação ao Redis (ver RedisConnectivityProbe).

create table if not exists shedlock (
    name varchar(64) not null,
    lock_until timestamp(3) not null,
    locked_at timestamp(3) not null,
    locked_by varchar(255) not null,
    primary key (name)
);
