package mz.norteshopmoz.api;

import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;

@SpringBootTest
@ActiveProfiles("unit-test")
public class BaseUnitTest {
    // Base class for unit tests using H2 in-memory database
    // Does not require Docker/Testcontainers
}