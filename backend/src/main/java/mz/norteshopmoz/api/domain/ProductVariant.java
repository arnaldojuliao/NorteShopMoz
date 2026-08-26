package mz.norteshopmoz.api.domain;

import java.util.List;

/** Grupo de variantes de um produto (contrato: { type, options: [{name, hex?}] }). */
public record ProductVariant(String type, List<VariantOption> options) {}
