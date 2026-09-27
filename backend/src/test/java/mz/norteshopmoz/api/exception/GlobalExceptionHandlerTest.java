package mz.norteshopmoz.api.exception;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.HttpRequestMethodNotSupportedException;
import org.springframework.web.bind.MissingServletRequestParameterException;
import org.springframework.web.multipart.MaxUploadSizeExceededException;

/**
 * Erros do cliente nunca podem sair como 500 (nem poluir os logs com ERROR) —
 * o catch-all genérico tratava-os assim antes destes handlers.
 */
class GlobalExceptionHandlerTest {

    private final GlobalExceptionHandler handler = new GlobalExceptionHandler();

    @Test
    void methodNotSupported_returns405_andSaysWhichMethodsAreAccepted() {
        HttpRequestMethodNotSupportedException ex =
                new HttpRequestMethodNotSupportedException("POST", List.of("GET", "PUT"));

        ResponseEntity<Map<String, String>> res = handler.handleMethodNotSupported(ex);

        assertThat(res.getStatusCode()).isEqualTo(HttpStatus.METHOD_NOT_ALLOWED);
        assertThat(res.getBody()).containsKey("error");
        assertThat(res.getBody().get("error")).contains("POST").contains("GET");
    }

    @Test
    void unreadableBody_returns400() {
        HttpMessageNotReadableException ex =
                new HttpMessageNotReadableException("JSON inválido", null);

        ResponseEntity<Map<String, String>> res = handler.handleUnreadable(ex);

        assertThat(res.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        assertThat(res.getBody().get("error")).contains("JSON");
    }

    @Test
    void missingQueryParameter_returns400_withTheParameterName() {
        MissingServletRequestParameterException ex =
                new MissingServletRequestParameterException("status", "String");

        ResponseEntity<Map<String, String>> res = handler.handleMissingParam(ex);

        assertThat(res.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        assertThat(res.getBody().get("error")).contains("status");
    }

    @Test
    void uploadTooLarge_returns413() {
        MaxUploadSizeExceededException ex = new MaxUploadSizeExceededException(10 * 1024 * 1024);

        ResponseEntity<Map<String, String>> res = handler.handleUploadTooLarge(ex);

        assertThat(res.getStatusCode()).isEqualTo(HttpStatus.PAYLOAD_TOO_LARGE);
        assertThat(res.getBody().get("error")).contains("grande");
    }
}
