# Partner Search fixtures (FO-60)

`topicOrganisations.sample.json` is built from the **masked** capture in
`docs/agent-results/TASK-MVCGPI6V3RM1F-fixtures/topicOrganisations.masked.json`
(3 of 118 organisation rows, plus the withdraw counts). Ids and PICs are synthetic
(`900000+`, `100000000+`) because the capture masks them. One PERSON row with a
fake `ecasId` is added to prove person rows are counted and never stored.

It is **not** a raw recording of the portal. A full live recording is still
outstanding (see the result file for the run).
