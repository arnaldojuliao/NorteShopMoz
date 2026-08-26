package mz.norteshopmoz.api.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Embeddable;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/** Endereço de entrega (contrato: fullName, phone, email, address, city, province, notes?). */
@Embeddable
@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class OrderAddress {

    @Column(nullable = false, length = 120)
    private String fullName;

    @Column(nullable = false, length = 40)
    private String phone;

    @Column(length = 150)
    private String email;

    @Column(nullable = false, length = 300)
    private String address;

    @Column(length = 80)
    private String city;

    @Column(nullable = false, length = 80)
    private String province;

    @Column(length = 500)
    private String notes;
}
