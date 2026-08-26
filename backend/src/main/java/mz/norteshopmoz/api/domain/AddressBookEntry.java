package mz.norteshopmoz.api.domain;

import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/** Endereço de entrega do cliente (contrato AddressBookEntry do frontend). */
@Entity
@Table(name = "address_book_entries")
@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class AddressBookEntry {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, length = 40)
    private String userId;

    @Column(length = 60)
    private String label;

    @Column(nullable = false, length = 80)
    private String fullName;

    @Column(nullable = false, length = 40)
    private String phone;

    @Column(nullable = false, length = 200)
    private String address;

    @Column(nullable = false, length = 80)
    private String city;

    @Column(nullable = false, length = 80)
    private String province;

    @Column(nullable = false)
    @JsonProperty("isDefault")
    private boolean isDefault;

    /** Coordenadas GPS (opcionais — para o entregador). */
    private Double lat;

    private Double lng;

    @Column(nullable = false, updatable = false)
    private Instant createdAt;
}
