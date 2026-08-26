package mz.norteshopmoz.api.web;

import jakarta.validation.Valid;
import java.util.List;
import mz.norteshopmoz.api.domain.AddressBookEntry;
import mz.norteshopmoz.api.security.UserPrincipal;
import mz.norteshopmoz.api.service.AddressService;
import mz.norteshopmoz.api.web.dto.AddressRequest;
import mz.norteshopmoz.api.web.dto.ApiResponse;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** Livro de endereços — apenas autenticado (o utilizador vê/edita os seus). */
@RestController
@RequestMapping("/api/addresses")
public class AddressController {

    private final AddressService addressService;

    public AddressController(AddressService addressService) {
        this.addressService = addressService;
    }

    @GetMapping
    public ResponseEntity<?> list(@AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(ApiResponse.data(addressService.getAddresses(principal.id())));
    }

    /** Substituição completa (mesmo padrão do carrinho/favoritos). */
    @PutMapping
    public ResponseEntity<?> replaceAll(
            @Valid @RequestBody List<AddressRequest> requests,
            @AuthenticationPrincipal UserPrincipal principal) {
        List<AddressBookEntry> saved = addressService.replaceAll(principal.id(), requests);
        return ResponseEntity.ok(ApiResponse.data(saved));
    }
}
