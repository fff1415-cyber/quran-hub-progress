# Stage 5 independent program-export correction — publication held

The export passed the semester object where a weekday-number array was expected, then passed a Set where scientific aggregators require an array. The candidate uses the semester's existing working_days and converts the resulting set to an array. No attendance weights, holiday policy, weekly denominator policy or stored grades change.

`node tests/stage5-program-export.cjs` invokes the actual export and scientific aggregators with a Monday/Wednesday calendar, an assessed zero and an excluded Friday score; checks period/scientific/weekly sheet totals; and serializes/reopens a real XLSX workbook without mutating inputs.

This independent change does not complete semester-separated storage, the partial-week policy decision, kiosk holiday handling or historical rule attribution. Those remain stage 5 acceptance requirements. Main-only isolation and restoration publication gates remain mandatory; nothing has been deployed.
