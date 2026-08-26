package mz.norteshopmoz.api.service;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import mz.norteshopmoz.api.config.ShippingConfig;
import mz.norteshopmoz.api.domain.AddressBookEntry;
import mz.norteshopmoz.api.exception.ApiException;
import mz.norteshopmoz.api.repository.AddressRepository;
import mz.norteshopmoz.api.web.dto.AddressRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Livro de endereços do cliente — GET lista, PUT substitui (mesmo padrão do
 * carrinho/favoritos: o frontend envia a lista completa e o servidor normaliza).
 */
@Service
public class AddressService {

    private final AddressRepository repository;
    private final ShippingConfig shippingConfig;

    public AddressService(AddressRepository repository, ShippingConfig shippingConfig) {
        this.repository = repository;
        this.shippingConfig = shippingConfig;
    }

    @Transactional(readOnly = true)
    public List<AddressBookEntry> getAddresses(String userId) {
        return repository.findByUserIdOrderByCreatedAtAsc(userId);
    }

    /**
     * Substitui todos os endereços do utilizador. Normaliza: províncias válidas,
     * no máximo um endereço padrão (o primeiro se nenhum for marcado) e ordem
     * estável pela lista enviada.
     */
    @Transactional
    public List<AddressBookEntry> replaceAll(String userId, List<AddressRequest> requests) {
        List<AddressRequest> input = requests == null ? List.of() : requests;
        for (AddressRequest r : input) {
            if (!shippingConfig.isValidProvince(r.province())) {
                throw ApiException.badRequest("Província de entrega inválida: " + r.province());
            }
        }
        repository.deleteByUserId(userId);

        boolean anyDefault = input.stream().anyMatch(r -> Boolean.TRUE.equals(r.isDefault()));
        Instant now = Instant.now();
        List<AddressBookEntry> saved = new ArrayList<>(input.size());
        for (int i = 0; i < input.size(); i++) {
            AddressRequest r = input.get(i);
            boolean isDefault = Boolean.TRUE.equals(r.isDefault()) || (i == 0 && !anyDefault);
            saved.add(repository.save(AddressBookEntry.builder()
                    .userId(userId)
                    .label(trimToNull(r.label()))
                    .fullName(r.fullName().trim())
                    .phone(r.phone().trim())
                    .address(r.address().trim())
                    .city(r.city().trim())
                    .province(r.province())
                    .isDefault(isDefault)
                    .lat(r.lat())
                    .lng(r.lng())
                    .createdAt(now)
                    .build()));
        }
        return saved;
    }

    private static String trimToNull(String value) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        return trimmed.isBlank() ? null : trimmed;
    }
}
