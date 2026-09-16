# Calculation and lookup-data basis

ThermaSpace in this repository implements the selected **CLTD / SCL / CLF**
workflow used in the project materials.

The bundled database includes:

- four Sri Lanka-adjusted hourly roof CLTD profiles,
- the supplied Sri Lanka-adjusted external-wall profile by 8 orientations × 24 hours,
- 24-hour glass-conduction CLTD,
- SCL values by orientation and hour,
- occupancy CLF schedules,
- lighting CLF schedules,
- Colombo baseline design-condition metadata.

The browser applies the project design-condition correction relative to the
stored baseline correction.

## Engineering validation note

This repository preserves supplied lookup values rather than silently changing
them. In particular, the supplied West-wall hour-19 CLTD value is preserved
exactly and should be checked against the original ASHRAE-derived source before
the final validation claim.

The calculator should be benchmarked against the manual server-room workbook
and approved example calculations before being described as engineering-grade.
