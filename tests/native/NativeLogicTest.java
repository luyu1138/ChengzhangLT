package cn.chengzhang.blueprint;

import com.aliyun.oss.HttpMethod;
import com.aliyun.oss.common.auth.DefaultCredentials;
import com.aliyun.oss.common.comm.RequestMessage;
import com.aliyun.oss.common.comm.SignVersion;
import com.aliyun.oss.internal.signer.OSSSignerBase;
import com.aliyun.oss.internal.signer.OSSSignerParams;
import com.sun.net.httpserver.HttpServer;
import java.net.InetSocketAddress;
import java.net.HttpURLConnection;
import java.net.URI;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.Map;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;
import org.json.JSONArray;
import org.json.JSONObject;

/** Actual JVM tests: official SDK signature oracle, real local HTTP, shared TS fixture. No live credentials. */
public final class NativeLogicTest {
    interface Checked { void run() throws Exception; }
    private static int passed;
    private static void test(String name, Checked body) throws Exception { body.run(); passed++; System.out.println("PASS " + name); }
    private static void equal(Object a, Object b) { if (!java.util.Objects.equals(a, b)) throw new AssertionError("Expected " + b + ", got " + a); }
    private static void rejects(Class<? extends Exception> type, Checked body) throws Exception {
        try { body.run(); } catch (Exception error) { if (type.isInstance(error)) return; throw error; }
        throw new AssertionError("Expected " + type.getSimpleName());
    }
    static JSONObject config() throws Exception {
        return new JSONObject().put("bucket", "blueprint-test-only").put("region", "cn-hangzhou")
                .put("accessKeyId", "TestOnlyAccessKey1234").put("accessKeySecret", "TestOnlySecret1234")
                .put("recoveryCode", "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA").put("generation", "test");
    }
    static JSONObject state(String kind, String time, String zone) throws Exception {
        return new JSONObject().put("persons", new JSONArray().put(new JSONObject().put("id", "p").put("name", "测试人物").put("timezone", zone)))
                .put("goals", new JSONArray()).put("instances", new JSONArray())
                .put("actions", new JSONArray().put(new JSONObject().put("id", "a").put("personId", "p").put("title", "固定计划")
                        .put("date", "2026-01-01").put("createdAt", "2025-01-01T00:00:00Z").put("reminderTime", time)
                        .put("repeat", new JSONObject().put("kind", kind).put("version", 1).put("weekdays", new JSONArray("[1,3,5]"))
                                .put("count", 2).put("monthDay", 31).put("interval", 3))));
    }
    private static JSONObject action(JSONObject state) throws Exception { return state.getJSONArray("actions").getJSONObject(0); }
    private static long remindersAt(JSONObject state, String instant) throws Exception {
        long target = Instant.parse(instant).toEpochMilli();
        return ReminderRules.upcoming(state, Instant.parse("2026-10-21T00:00:00Z")).stream().filter(o -> o.at == target).count();
    }
    private static void signatureOracle(String method) throws Exception {
        OssConfig config = new OssConfig(config()); String key = "growth-blueprint/space/device/2026-10-21.gbp";
        byte[] body = "加密传输测试".getBytes(StandardCharsets.UTF_8);
        Map<String,String> ours = OssSigner.headers(config, method, key, method.equals("PUT") ? body : null, Instant.now());
        OSSSignerParams params = new OSSSignerParams("/" + config.bucket + "/" + key, new DefaultCredentials(config.accessKeyId, config.accessKeySecret));
        params.setRegion(config.region); params.setProduct("oss");
        RequestMessage request = new RequestMessage(config.bucket, key); request.setMethod(HttpMethod.valueOf(method)); request.setEndpoint(URI.create(config.endpoint()));
        for (Map.Entry<String,String> header : ours.entrySet()) if (!header.getKey().equals("Authorization")) request.addHeader(header.getKey(), header.getValue());
        OSSSignerBase.createRequestSigner(SignVersion.V4, params).sign(request);
        String stamp = request.getHeaders().get("x-oss-date");
        Instant signedAt = DateTimeFormatter.ofPattern("yyyyMMdd'T'HHmmss'Z'").withZone(ZoneOffset.UTC).parse(stamp, Instant::from);
        equal(OssSigner.headers(config, method, key, method.equals("PUT") ? body : null, signedAt).get("Authorization"), request.getHeaders().get("Authorization"));
    }
    private static OssFailure failure(int status, String method, String body, String requestId) throws Exception {
        HttpURLConnection connection = new HttpURLConnection(new URL("https://oss.invalid/")) {
            @Override public void connect() { }
            @Override public void disconnect() { }
            @Override public boolean usingProxy() { return false; }
            @Override public String getHeaderField(String name) { return requestId; }
            @Override public java.io.InputStream getErrorStream() { return new java.io.ByteArrayInputStream(body.getBytes(StandardCharsets.UTF_8)); }
        };
        return OssFailure.from(new OssConfig(config()), method, status, connection);
    }
    public static void main(String[] args) throws Exception {
        Path directory = Path.of(args[0]);
        test("OSS V4 PUT matches official aliyun-sdk-oss 3.18.3", () -> signatureOracle("PUT"));
        test("OSS V4 GET matches official aliyun-sdk-oss 3.18.3", () -> signatureOracle("GET"));
        test("AccessDenied distinguishes upload permission and download verification permission", () -> {
            for (String method : new String[]{"PUT", "GET"}) {
                OssFailure error = failure(403, method, "<Error><Code>AccessDenied</Code><RequestId>0123456789ABCDEF01234567</RequestId></Error>", null);
                equal(error.code, "AccessDenied"); equal(error.requestId, "0123456789ABCDEF01234567"); equal(error.status, 403);
                if (!error.getMessage().contains(method.equals("PUT") ? "oss:PutObject" : "oss:GetObject")) throw new AssertionError("wrong permission hint");
            }
        });
        test("Credential, signature, region and clock errors have distinct safe advice", () -> {
            String[][] cases = {{"InvalidAccessKeyId", "不存在或已停用"}, {"SignatureDoesNotMatch", "签名不匹配"},
                    {"AuthorizationHeaderMalformed", "实际地域"}, {"RequestTimeTooSkewed", "自动日期时间"}};
            for (String[] row : cases) {
                OssFailure error = failure(403, "PUT", "<Error><Code>" + row[0] + "</Code></Error>", "0123456789ABCDEF01234567");
                equal(error.code, row[0]); if (!error.getMessage().contains(row[1])) throw new AssertionError("missing specific advice");
            }
        });
        test("Reflected secret fields, unknown codes and unsafe request IDs never reach error messages", () -> {
            String secrets = config().getString("accessKeySecret") + config().getString("accessKeyId") + config().getString("recoveryCode");
            for (String code : new String[]{"SignatureDoesNotMatch", secrets}) {
                OssFailure error = failure(403, "PUT", "<Error><Code>" + code + "</Code><Message>" + secrets + "</Message><StringToSign>" + secrets + "</StringToSign><RequestId>" + secrets + "</RequestId></Error>", secrets);
                String message = error.getMessage();
                if (message.contains("TestOnly") || message.contains("StringToSign") || message.contains(config().getString("recoveryCode"))) throw new AssertionError("leaked reflected request");
                equal(error.requestId, "");
            }
        });
        test("Malformed/non-XML errors retain HTTP status without echoing HTML or entities", () -> {
            OssFailure error = failure(403, "GET", "<!DOCTYPE Error [<!ENTITY x SYSTEM 'file:///secret'>]><Error><Code>&x;</Code></Error><script>private</script>", null);
            equal(error.code, ""); equal(error.status, 403);
            if (error.getMessage().contains("private") || error.getMessage().contains("file:")) throw new AssertionError("unsafe response");
        });
        test("Error stream reads are capped and read failures cannot hide HTTP status", () -> {
            AtomicInteger count = new AtomicInteger();
            HttpURLConnection connection = new HttpURLConnection(new URL("https://oss.invalid/")) {
                @Override public void connect() { }
                @Override public void disconnect() { }
                @Override public boolean usingProxy() { return false; }
                @Override public java.io.InputStream getErrorStream() {
                    return new java.io.InputStream() { @Override public int read() { count.incrementAndGet(); return 'x'; } };
                }
            };
            equal(OssFailure.from(new OssConfig(config()), "PUT", 403, connection).status, 403);
            equal(count.get(), OssFailure.MAX_ERROR_BYTES);
            connection = new HttpURLConnection(new URL("https://oss.invalid/")) {
                @Override public void connect() { }
                @Override public void disconnect() { }
                @Override public boolean usingProxy() { return false; }
                @Override public java.io.InputStream getErrorStream() { throw new IllegalStateException("private response"); }
                @Override public String getHeaderField(String name) { throw new IllegalStateException("private header"); }
            };
            equal(OssFailure.from(new OssConfig(config()), "PUT", 403, connection).status, 403);
        });
        test("Bucket/region URL injection and unsafe object paths are rejected", () -> {
            rejects(IllegalArgumentException.class, () -> new OssConfig(config().put("region", "cn-hangzhou/evil")));
            rejects(IllegalArgumentException.class, () -> new OssConfig(config().put("bucket", "evil.example")));
            rejects(IllegalArgumentException.class, () -> OssSigner.headers(new OssConfig(config()), "PUT", "../secret", new byte[0], Instant.now()));
        });
        test("Recovery code must decode to exactly 256 bits", () -> rejects(IllegalArgumentException.class, () -> new OssConfig(config().put("recoveryCode", "bad"))));
        test("42 native recurrence decisions agree with domain.ts fixtures", () -> {
            JSONArray fixtures = new JSONArray(Files.readString(directory.resolve("rules.json")));
            equal(fixtures.length(), 42);
            for (int i = 0; i < fixtures.length(); i++) { JSONObject f = fixtures.getJSONObject(i); equal(ReminderRules.scheduled(f.getJSONObject("action"), LocalDate.parse(f.getString("date"))), f.getBoolean("expected")); }
        });
        test("Daily reminder uses person's timezone and preserves notification owner/date", () -> {
            JSONObject s = state("daily", "09:00", "Asia/Shanghai"); equal(remindersAt(s, "2026-10-21T01:00:00Z"), 1L);
            ReminderRules.Occurrence item = ReminderRules.upcoming(s, Instant.parse("2026-10-21T00:00:00Z")).stream().filter(o -> o.at == Instant.parse("2026-10-21T01:00:00Z").toEpochMilli()).findFirst().orElseThrow();
            equal(item.personId, "p"); equal(item.date, "2026-10-21");
        });
        test("Weekday rule excludes the next unscheduled weekday", () -> equal(remindersAt(state("weekdays", "09:00", "Asia/Shanghai"), "2026-10-22T01:00:00Z"), 0L));
        test("Monthly 31st skips short months", () -> {
            JSONObject a = action(state("monthly", "09:00", "Asia/Shanghai"));
            equal(ReminderRules.scheduled(a, LocalDate.parse("2026-11-30")), false); equal(ReminderRules.scheduled(a, LocalDate.parse("2026-12-31")), true);
        });
        test("Completed/cancelled instances do not remind", () -> {
            for (String flag : new String[]{"done", "cancelled"}) {
                JSONObject s = state("daily", "09:00", "Asia/Shanghai");
                s.getJSONArray("instances").put(new JSONObject().put("id", "a:1:2026-10-21").put("actionId", "a").put("date", "2026-10-21").put(flag, true));
                equal(remindersAt(s, "2026-10-21T01:00:00Z"), 0L);
            }
        });
        test("Paused, archived and trashed owners do not remind", () -> {
            JSONObject s = state("daily", "09:00", "Asia/Shanghai"); action(s).put("paused", true); equal(ReminderRules.upcoming(s, Instant.parse("2026-10-21T00:00:00Z")).size(), 0);
            for (String flag : new String[]{"archivedAt", "deletedAt"}) { s = state("daily", "09:00", "Asia/Shanghai"); s.getJSONArray("persons").getJSONObject(0).put(flag, "2026-10-20"); equal(remindersAt(s, "2026-10-21T01:00:00Z"), 0L); }
        });
        test("Paused linked goal suppresses reminders", () -> {
            JSONObject s = state("daily", "09:00", "Asia/Shanghai"); action(s).put("goalId", "g"); s.getJSONArray("goals").put(new JSONObject().put("id", "g").put("status", "paused"));
            equal(remindersAt(s, "2026-10-21T01:00:00Z"), 0L);
        });
        test("Moved once-only instance reminds on new date, preserving ID", () -> {
            JSONObject s = state("once", "09:00", "Asia/Shanghai"); action(s).put("date", "2026-10-21");
            s.getJSONArray("instances").put(new JSONObject().put("id", "a:1:2026-10-21").put("actionId", "a").put("date", "2026-10-22").put("period", "2026-10-21"));
            equal(remindersAt(s, "2026-10-21T01:00:00Z"), 0L); equal(remindersAt(s, "2026-10-22T01:00:00Z"), 1L);
        });
        test("Weekly N rule stops after today's completion", () -> {
            JSONObject s = state("weekly", "09:00", "Asia/Shanghai");
            s.getJSONArray("instances").put(new JSONObject().put("id", "a:1:week:2026-10-19:0").put("actionId", "a").put("done", true).put("completedAt", "2026-10-21T00:30:00Z"));
            equal(remindersAt(s, "2026-10-21T01:00:00Z"), 0L); equal(remindersAt(s, "2026-10-22T01:00:00Z"), 1L);
        });
        test("DST gap shifts forward; overlap produces one occurrence", () -> {
            JSONObject s = state("daily", "02:30", "America/New_York");
            long count = ReminderRules.upcoming(s, Instant.parse("2026-03-08T00:00:00Z")).stream().filter(o -> o.at == Instant.parse("2026-03-08T07:30:00Z").toEpochMilli()).count(); equal(count, 1L);
            s = state("daily", "01:30", "America/New_York");
            count = ReminderRules.upcoming(s, Instant.parse("2026-11-01T00:00:00Z")).stream().filter(o -> o.id.endsWith("2026-11-01")).count(); equal(count, 1L);
        });
        test("Native portable encryption uses random nonces, preserves TS state and hides plaintext", () -> {
            JSONObject s = new JSONObject(Files.readString(directory.resolve("state.json"))); String code = config().getString("recoveryCode");
            byte[] a = PortableBackup.encrypt(s, code, "2026-10-21T00:00:00Z"), b = PortableBackup.encrypt(s, code, "2026-10-21T00:00:00Z");
            if (java.util.Arrays.equals(a, b) || new String(a, StandardCharsets.UTF_8).contains("互操作测试人物")) throw new AssertionError("encryption");
            Files.write(directory.resolve("native.gbp"), a);
        });
        AtomicReference<byte[]> saved = new AtomicReference<>(new byte[0]); AtomicInteger status = new AtomicInteger(200), requests = new AtomicInteger();
        AtomicReference<Boolean> tamper = new AtomicReference<>(false), denyRead = new AtomicReference<>(false);
        HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/", exchange -> {
            requests.incrementAndGet(); byte[] body = exchange.getRequestBody().readAllBytes();
            int responseStatus = denyRead.get() && exchange.getRequestMethod().equals("GET") ? 403 : status.get();
            if (exchange.getRequestMethod().equals("PUT") && responseStatus == 200) saved.set(body);
            byte[] response = tamper.get() ? new byte[]{1,2,3} : saved.get();
            if (exchange.getRequestMethod().equals("PUT")) response = new byte[0];
            if (responseStatus == 403) response = "<Error><Code>AccessDenied</Code><Message>TestOnlySecret1234</Message><RequestId>0123456789ABCDEF01234567</RequestId></Error>".getBytes(StandardCharsets.UTF_8);
            if (exchange.getRequestHeaders().getFirst("Authorization") == null) throw new AssertionError("missing V4 signature");
            exchange.getResponseHeaders().add("x-oss-request-id", "0123456789ABCDEF01234567");
            exchange.sendResponseHeaders(responseStatus, response.length == 0 ? -1 : response.length);
            exchange.getResponseBody().write(response); exchange.close();
        }); server.start();
        try {
            OssClient client = new OssClient(url -> (HttpURLConnection) new URL("http://127.0.0.1:" + server.getAddress().getPort() + url.getPath()).openConnection());
            OssConfig config = new OssConfig(config()); byte[] body = Files.readAllBytes(directory.resolve("native.gbp"));
            test("Actual HTTP PUT and GET verify identical encrypted bytes", () -> { client.uploadVerified(config, "growth-blueprint/test.gbp", body, () -> {}); equal(requests.get(), 2); });
            test("Actual GET denial after successful PUT reports read permission, code and request ID", () -> {
                denyRead.set(true); int before = requests.get();
                try { client.uploadVerified(config, "growth-blueprint/test.gbp", body, () -> {}); throw new AssertionError("must fail read verification"); }
                catch (OssFailure error) {
                    equal(error.method, "GET"); equal(error.code, "AccessDenied"); equal(error.requestId, "0123456789ABCDEF01234567");
                    if (!error.getMessage().contains("下载校验") || !error.getMessage().contains("oss:GetObject") || error.getMessage().contains("TestOnly")) throw new AssertionError("unsafe or ambiguous error");
                } finally { denyRead.set(false); }
                equal(requests.get(), before + 2);
            });
            test("Corrupt read-back never reports success", () -> { tamper.set(true); rejects(java.io.IOException.class, () -> client.uploadVerified(config, "growth-blueprint/test.gbp", body, () -> {})); tamper.set(false); });
            test("403 and redirects fail without following or leaking response bodies", () -> {
                for (int code : new int[]{403, 301}) { status.set(code); int before = requests.get(); rejects(java.io.IOException.class, () -> client.uploadVerified(config, "growth-blueprint/test.gbp", body, () -> {})); equal(requests.get(), before + 1); } status.set(200);
            });
            test("Cancellation prevents sending any request", () -> { int before = requests.get(); rejects(InterruptedException.class, () -> client.uploadVerified(config, "growth-blueprint/test.gbp", body, () -> { throw new InterruptedException(); })); equal(requests.get(), before); });
        } finally { server.stop(0); }
        System.out.println("Native JVM tests: " + passed + " passed, 0 failed");
    }
}
