# Official source copies

`docs/delhivery-api-contract.md` cites official Delhivery pages as S1–S17. Unmodified copies of those files
were downloaded on 2026-10-04 and are kept **locally only**. They are Delhivery's material and are not
redistributed in this repository.

`SHA256SUMS.txt` lists every file with its checksum. To rebuild and verify the copies:

- Developer-portal files: `https://one.delhivery.com/developer-portal/assets/<file name>` → save to `one.delhivery.com/`
- Help Center pages: `https://help.delhivery.com/docs/<slug>.md` → save to `help.delhivery.com/help_<slug>.md`
- Maps Address Validation: the text of https://www.delhivery.com/maps/reference#address-validation-api (rendered client-side)

```bash
shasum -a 256 -c SHA256SUMS.txt
```

Delhivery redeploys its portal under new hashed file names, so the files listed here may stop being available.
A checksum mismatch means the published documentation has changed since 2026-10-04.
