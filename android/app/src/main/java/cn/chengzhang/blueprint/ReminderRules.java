package cn.chengzhang.blueprint;

import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneId;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.json.JSONArray;
import org.json.JSONObject;

/** Same instance IDs and short-month semantics as domain.ts, evaluated without a WebView. */
final class ReminderRules {
    static final class Occurrence {
        final String id, personId, date, person, title; final long at;
        Occurrence(String id, String personId, String date, String person, String title, long at) { this.id = id; this.personId = personId; this.date = date; this.person = person; this.title = title; this.at = at; }
    }
    static boolean scheduled(JSONObject action, LocalDate date) throws Exception {
        if (action.optBoolean("paused") || date.isBefore(LocalDate.parse(action.getString("date"))) ||
                (!action.optString("end").isEmpty() && date.isAfter(LocalDate.parse(action.getString("end"))))) return false;
        JSONObject repeat = action.getJSONObject("repeat");
        switch (repeat.getString("kind")) {
            case "once": return date.toString().equals(action.getString("date"));
            case "daily": case "weekly": return true;
            case "weekdays":
                JSONArray days = repeat.getJSONArray("weekdays");
                for (int i = 0; i < days.length(); i++) if (days.getInt(i) == date.getDayOfWeek().getValue() % 7) return true;
                return false;
            case "monthly": return date.getDayOfMonth() == repeat.getInt("monthDay");
            case "interval": return ChronoUnit.DAYS.between(LocalDate.parse(action.getString("date")), date) % repeat.getInt("interval") == 0;
            default: return false;
        }
    }
    static List<Occurrence> upcoming(JSONObject state, Instant now) throws Exception {
        Map<String,JSONObject> people = index(state.getJSONArray("persons")), goals = index(state.getJSONArray("goals")), instances = index(state.getJSONArray("instances"));
        List<Occurrence> result = new ArrayList<>(); JSONArray actions = state.getJSONArray("actions");
        for (int ai = 0; ai < actions.length(); ai++) {
            JSONObject action = actions.getJSONObject(ai), person = people.get(action.getString("personId"));
            if (person == null || !person.optString("deletedAt").isEmpty() || !person.optString("archivedAt").isEmpty() || action.optBoolean("paused")) continue;
            String time = action.optString("reminderTime"); if (!time.matches("([01]\\d|2[0-3]):[0-5]\\d")) continue;
            JSONObject goal = goals.get(action.optString("goalId"));
            if (goal != null && java.util.Arrays.asList("paused", "terminated", "archived").contains(goal.optString("status"))) continue;
            ZoneId zone = ZoneId.of(person.getString("timezone")); LocalDate today = now.atZone(zone).toLocalDate();
            for (int di = -1; di <= 35; di++) {
                LocalDate date = today.plusDays(di); long at = date.atTime(LocalTime.parse(time)).atZone(zone).toInstant().toEpochMilli();
                if (at < now.toEpochMilli() - 24L * 60 * 60 * 1000) continue;
                if (!action.optString("createdAt").isEmpty() && at < Instant.parse(action.getString("createdAt")).toEpochMilli()) continue;
                JSONObject repeat = action.getJSONObject("repeat"); String id = action.getString("id") + ":" + repeat.getInt("version") + ":" + date;
                boolean include = scheduled(action, date);
                if ("weekly".equals(repeat.getString("kind"))) {
                    if (!include) continue;
                    String week = date.minusDays(date.getDayOfWeek().getValue() - 1).toString();
                    String prefix = action.getString("id") + ":" + repeat.getInt("version") + ":week:" + week + ":";
                    int done = 0; boolean completedToday = false;
                    for (JSONObject saved : instances.values()) if (action.getString("id").equals(saved.optString("actionId")) && saved.optBoolean("done")) {
                        if (saved.getString("id").startsWith(prefix)) done++;
                        String completed = saved.optString("completedAt");
                        if (!completed.isEmpty() && Instant.parse(completed).atZone(zone).toLocalDate().equals(date)) completedToday = true;
                    }
                    if (done >= repeat.getInt("count") || completedToday) continue;
                    id = prefix + "reminder:" + date;
                } else {
                    JSONObject saved = instances.get(id);
                    if (saved != null && (saved.optBoolean("done") || saved.optBoolean("cancelled") || !date.toString().equals(saved.optString("date")))) include = false;
                }
                if (include) result.add(new Occurrence(id, person.getString("id"), date.toString(), person.getString("name"), action.getString("title"), at));
                // Saved moved instances (including old rule versions) retain their own identity/history.
                for (JSONObject saved : instances.values()) if (action.getString("id").equals(saved.optString("actionId")) &&
                        !saved.getString("id").equals(id) && date.toString().equals(saved.optString("date")) &&
                        !saved.optString("period").startsWith("week:") && !saved.optBoolean("done") && !saved.optBoolean("cancelled"))
                    result.add(new Occurrence(saved.getString("id"), person.getString("id"), date.toString(), person.getString("name"), action.getString("title"), at));
            }
        }
        result.sort(Comparator.comparingLong(o -> o.at)); return result;
    }
    private static Map<String,JSONObject> index(JSONArray array) throws Exception {
        Map<String,JSONObject> result = new HashMap<>();
        for (int i = 0; i < array.length(); i++) { JSONObject value = array.getJSONObject(i); result.put(value.getString("id"), value); }
        return result;
    }
}
