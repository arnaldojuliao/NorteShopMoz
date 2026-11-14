package mz.norteshopmoz.api.exception;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.stream.Collectors;
import mz.norteshopmoz.api.config.RequestIdFilter;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.HttpRequestMethodNotSupportedException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.MissingServletRequestParameterException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
import org.springframework.web.multipart.MaxUploadSizeExceededException;
import org.springframework.web.servlet.resource.NoResourceFoundException;

/**
 * Converte exceções no envelope de erro do contrato: {"error": "mensagem"}.
 *
 * <p>Quando o pedido traz um identificador de correlação (ver
 * {@link RequestIdFilter}), o corpo inclui também {@code requestId} — é esse o
 * código que o cliente deve indicar ao suporte, e é o que permite encontrar a
 * linha exata no log.</p>
 */
@RestControllerAdvice
public class GlobalExceptionHandler {

    private static final Logger log = LoggerFactory.getLogger(GlobalExceptionHandler.class);

    /** Envelope de erro: {@code error} e, se houver, o {@code requestId} do pedido. */
    static Map<String, String> errorBody(String message) {
        String requestId = RequestIdFilter.currentRequestId();
        if (requestId == null) {
            return Map.of("error", message);
        }
        Map<String, String> body = new LinkedHashMap<>();
        body.put("error", message);
        body.put("requestId", requestId);
        return body;
    }

    @ExceptionHandler(ApiException.class)
    public ResponseEntity<Map<String, String>> handleApi(ApiException ex) {
        return ResponseEntity.status(ex.getStatus()).body(errorBody(ex.getMessage()));
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<Map<String, String>> handleValidation(MethodArgumentNotValidException ex) {
        String message = ex.getBindingResult().getFieldErrors().stream()
                .findFirst()
                .map(f -> f.getField() + ": " + f.getDefaultMessage())
                .orElse("Dados inválidos");
        return ResponseEntity.badRequest().body(errorBody(message));
    }

    @ExceptionHandler(MethodArgumentTypeMismatchException.class)
    public ResponseEntity<Map<String, String>> handleTypeMismatch(MethodArgumentTypeMismatchException ex) {
        return ResponseEntity.badRequest().body(errorBody("Parâmetro inválido: " + ex.getName()));
    }

    @ExceptionHandler(NoResourceFoundException.class)
    public ResponseEntity<Map<String, String>> handleNoResource(NoResourceFoundException ex) {
        return ResponseEntity.status(HttpStatus.NOT_FOUND).body(errorBody("Recurso não encontrado"));
    }

    /**
     * Verbo HTTP errado na rota (ex.: POST onde só existe GET/PUT) → **405**.
     *
     * <p>Sem este handler, o catch-all genérico respondia 500 «Erro interno do
     * servidor» e escrevia um ERROR no log por cada chamada mal formada — um
     * erro do cliente tratado como falha do servidor (e ruído de alertas).
     */
    @ExceptionHandler(HttpRequestMethodNotSupportedException.class)
    public ResponseEntity<Map<String, String>> handleMethodNotSupported(
            HttpRequestMethodNotSupportedException ex) {
        String supported = ex.getSupportedHttpMethods() == null
                ? ""
                : ex.getSupportedHttpMethods().stream().map(Object::toString).sorted()
                        .collect(Collectors.joining(", "));
        String message = "Método " + ex.getMethod() + " não permitido neste recurso"
                + (supported.isBlank() ? "." : ". Métodos aceites: " + supported + ".");
        return ResponseEntity.status(HttpStatus.METHOD_NOT_ALLOWED).body(errorBody(message));
    }

    /** Corpo JSON ilegível (sintaxe inválida, tipo errado) ou ausente → **400**. */
    @ExceptionHandler(HttpMessageNotReadableException.class)
    public ResponseEntity<Map<String, String>> handleUnreadable(HttpMessageNotReadableException ex) {
        return ResponseEntity.badRequest()
                .body(errorBody("Corpo do pedido inválido ou em falta (JSON mal formado)."));
    }

    /** Parâmetro de query obrigatório em falta → **400**. */
    @ExceptionHandler(MissingServletRequestParameterException.class)
    public ResponseEntity<Map<String, String>> handleMissingParam(MissingServletRequestParameterException ex) {
        return ResponseEntity.badRequest()
                .body(errorBody("Parâmetro obrigatório em falta: " + ex.getParameterName()));
    }

    /** Ficheiro acima do limite configurado (10 MB) → **413**. */
    @ExceptionHandler(MaxUploadSizeExceededException.class)
    public ResponseEntity<Map<String, String>> handleUploadTooLarge(MaxUploadSizeExceededException ex) {
        return ResponseEntity.status(HttpStatus.PAYLOAD_TOO_LARGE)
                .body(errorBody("Ficheiro demasiado grande (máx. 10 MB)."));
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<Map<String, String>> handleGeneric(Exception ex) {
        log.error("Erro não tratado", ex);
        return ResponseEntity.internalServerError().body(errorBody("Erro interno do servidor"));
    }
}
