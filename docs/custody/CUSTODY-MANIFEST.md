# Build Room — Custody Manifest

Governed inventory of working-folder custody artifacts and their SHA-256
identities. The artifacts themselves live in `~/MADVenturesOPs/build-room/`
and are **not** committed; this file is what makes them verifiable from a
governed repository.

**This manifest is not authority.** Authority lives in
`~/MADVenturesOPs/FounderOS/07-decisions/`. This file records what custody
exists, so a reader can check a hash against an artifact without trusting
the working folder.

- Generated (UTC): `2026-09-12T21:38:45Z`
- Build Room root: `/Users/michaeldaley/MADVenturesOPs/build-room`
- Custody files: `109`
- Excluded from custody (named, so the exclusion is auditable):
  - `enforcement-core/` — code tree incl. node_modules
  - `session/` — no custody artifacts at time of writing
  - `source/*-audit-repo/`, `source/procoder-audit/`, `source/row-bot-site/`, `source/row-bot-subreports/`, `source/_inventory/` — third-party clones (NOT custody)
  - NOTE: `source/` is mixed. Its top-level `.md`/`.txt` documents ARE custody and ARE inventoried above.

## Custody artifacts

| Path (relative to Build Room root) | SHA-256 | Bytes |
|---|---|---|
| `planning/FOUNDER-RULING-seat-registry-v1-reserved-items-FINAL.md` | `02be78850fadcbedf734632ae8266062c6d3ade478a84096a5d29170b671925a` | 16966 |
| `planning/FOUNDER-RULING-seat-registry-v1-reserved-items.md` | `b82f14bedf197e4fe86cb49565241a8bcd94cb558769f3567024b6128f0b0aee` | 16812 |
| `planning/seat-registry-v1-implementation-plan-r2.md` | `b641d1066f0e8e9a35bbefacba865c8b4d439db51c69a5c21d2c79413b20f25a` | 18157 |
| `planning/seat-registry-v1-implementation-plan-r3.md` | `bbc71885f2db5f486ec750064c5ad346b5c03d3f48b30c3e920223eecdad7244` | 21678 |
| `planning/seat-registry-v1-implementation-plan.md` | `55b504f0ab0aa922175658db21b2e3414bf4199538e45f3afe58027301b53e15` | 11806 |
| `source/fable-architecture-implementation-planning-package-v1.0.md` | `d41864d0ecbf6f3dd11e673b32e2d22b6fb23de66b2b0c6ae62c5b09cb1bf26b` | 154512 |
| `source/fable-dec-package-prompt.txt` | `7155a37da0c8c0e8218ff6f30bcf3e8ecef5683850363f7e62bf8cc57ac18afc` | 14505 |
| `source/oh-my-hermes-audit-and-advantage-report.md` | `37cc8d51c42f5df0a385260ff4cc0f33ccbde6e24e92544a2b5f8b73ddbd62df` | 11074 |
| `source/row-bot-audit-and-advantage-report.md` | `a32a1712c14bdec818df398f60a3c91f99c63617ad972443eef6617ccafe9db5` | 21662 |
| `source/three-repos-skill-evidence-2026-08-19.md` | `cc233b8661db5320456bf503accecaa9f873b69ca7d578e9c1ede5903b1a91b8` | 13019 |
| `templates/tier2-review-template.md` | `6d1385e196047e5551fdeeecfd8950d509968a29a829809854f7b5f5a77005e1` | 15808 |
| `verification/DRAFT-founder-auth-m13-chain-tasks30-32-20260902.md` | `923a1dbc4ed1448c4830849d50de7f07e5fd883ffd6e9dcf288002daa812cd72` | 9153 |
| `verification/DRAFT-founder-auth-m13-task33-r1-20260902-r2.md` | `656cba4802d0df98932ce53615a319934d1bf7612f5438473ef95db3a529459d` | 13328 |
| `verification/DRAFT-founder-auth-m13-task33-r1-20260902-r3.md` | `8816b20316472c7e69b39a31683545220292e82bf652fb13e4fe0d80dfcc778b` | 14321 |
| `verification/DRAFT-founder-auth-m13-task33-r1-20260902-r4.md` | `11355376a0107f7ffafe2fd261fdbc2e2f27c3c5363200e798e6602e93aa3185` | 15625 |
| `verification/DRAFT-founder-auth-m13-task33-r1-20260902-r5.md` | `0920188e8730b612b01f8aa59528ce5b413c98431b1ce16bbfae99803cc4d9b0` | 16082 |
| `verification/DRAFT-founder-auth-m13-task33-r1-20260902.md` | `bf0e7e7234a7c116d0cbe4fc9a96a2a0c736bb1afe267f0ee9fecbd76b8a134e` | 10428 |
| `verification/HANDOFF-m19-t42-43-state-20260829.md` | `67d8ced64d9723a44f86124c6f7d2172349c1fb86a6fe1d82542c85c63eaaa9d` | 10454 |
| `verification/ISSUE-founder-auth-m13-task33-r1-phase1-20260902.md` | `37502f44649cd15655354372bc3395ba653d3067d3c6a6dbb85ef072ecd178ae` | 1298 |
| `verification/MERGE-AUTH-CHECKLIST.md` | `93811266e67167f67db11ba4de376903be9b494686a41b62df7152444aaa5ac1` | 3100 |
| `verification/OPEN-DECISIONS-README.md` | `6425016bcca46d80845a9287331c992baf22805063dad421f4327ba323e24b76` | 1819 |
| `verification/PLAN-CLOSED-README.md` | `87e36f0e364e75b95e3e9fa529cefc9227fbb1e2cb45b1d3d829295bcfa3c7c5` | 2472 |
| `verification/README.md` | `acefd6bd38d715f521b2e1e66cd447f18fb872c11c969c4548bed59506a8857c` | 4502 |
| `verification/REVIEW-C01-C18-20260904.md` | `5663350baf621f9f2d7cd23acd82c6d6cafded1cae49e5f1620288cc44acf89f` | 7751 |
| `verification/TOOL-CONFIG-ALIGNMENT-PHASE2-20260904.md` | `3989c04d14b62eb1a0ba030018eca854fe8e93fcbc6c854400d29689f1086db8` | 5995 |
| `verification/compiler-weekly-2026-09-04-buildroom.txt` | `ba58e030437537c1a3b4264570e397d2a3d1cb45dbd4aacf8e1039faedce56f2` | 91571 |
| `verification/compiler-weekly-2026-09-04-founderos.txt` | `6a785f9daafaa785b87c5b9bad30a90f13df0ed5237d1517e19cbb5c5a11621d` | 401 |
| `verification/compiler-weekly-2026-09-07-buildroom.txt` | `545a18d1d310f5126589bf9883bf1c9d776bd6eeff6811635765e00be4a019c0` | 91571 |
| `verification/compiler-weekly-2026-09-07-founderos.txt` | `4052ea7216cb8f31a34c3fe582363a7e2982177d162da165f308a16225abee9a` | 401 |
| `verification/cross-family-synthesis-m5task12-4df7749a-20260904.txt` | `e33fe5c184087e9ce2d5c60433252f6915e271dc47ca29915987796a26a0cea6` | 9498 |
| `verification/cross-family-synthesis-m5task12-r3-4f64b08-20260905.txt` | `dd029029f5b05ed42afa7b98bbae1b1413efac94c8dfba83ba8b283ede7dbbcc` | 4162 |
| `verification/cross-family-synthesis-seat-registry-v1.1-656cbee-20260904.txt` | `5082cb56a0d64abdb53f65396043694b8828e1d3f93385b25ba5d636fe130d68` | 6723 |
| `verification/m19-authorization-packet-20260828.md` | `7abdf7c91fcba8900a4a3f6b3d2e067d3af93538b9fcf633490a05ac25441587` | 21354 |
| `verification/open-decisions-2026-09-04.txt` | `a326ce4eea83c7c8c6307fd8f0a47c14c964ffaadd946970d19064a6ed32a986` | 195 |
| `verification/open-decisions-2026-09-07.txt` | `e324d33ba7522e7be40e4ba4d0cdd6a2058ec2ccc59cb2142d73620b3caa3570` | 195 |
| `verification/postmerge-task44-5e26c58-20260904.txt` | `7a2484ef66ffa51f9c68df3ddac4eebc4fe8a2fab37a4021c5499a618ccc0987` | 2173 |
| `verification/pr35-ci-reviewstate-ed85c18.txt` | `87aa047350751f0f24d4b2fcee5c3decc8d8e1eff8330c33d4a8014e542e6f8c` | 5517 |
| `verification/pr35-coderabbit-triage-ed85c18.txt` | `f713fd85b56ce9220b89a736f5b9ad771450dd92feef407f695ee9f92f82ca70` | 9821 |
| `verification/ruleset-20943319-AFTER-20260830.json` | `a07bcd24861c86815eaab0b8308c59864ddaa3badebb3943589d24ec577c3a08` | 1464 |
| `verification/ruleset-20943319-BEFORE-20260830.json` | `83a4bab6fad59bf5ac0e3cb1dd4201e9057f323055fd854737ce1b251403e730` | 1465 |
| `verification/ruleset-20943319-PATCH-20260830.json` | `6d5e55b76b18fb304eaa1a7f8458f153f46f0bdd168ce51472d33db39e537a15` | 1573 |
| `verification/ruleset-20943319-correction-record.md` | `9ac343a2a280ffdffa74cac248f66bf003c924c0d4fd5092a1cf102da034b26a` | 8357 |
| `verification/task34-rebind-verification-20260902.md` | `3bf0c80bbb0dedaff1fd8382aede5c5455150eaada30478fa4b37b50e1d96e9f` | 4305 |
| `verification/task44-C7-kimi-brief.md` | `647dc7abab7a4c8334646b3584747efe1de1bd164953a7787b277541b1124c86` | 13315 |
| `verification/task44-C7-kimi-verdict-CONFIRMED.txt` | `1f3fa7aeb0ef22ff8c5b649f34ecb67c1041d47dbfd111eecadeab4536a4ae0c` | 2717 |
| `verification/task44-addendum-C7-ordering.md` | `aa48b7bdcd571432720dfa95da901dca7e2ab9d7a6aa4974cffc0b1bc8f7137b` | 6390 |
| `verification/task44-addendum-C8-env-observation-deferral.md` | `ed2de8a76e98d9a50b1ee3202cbb2dcfd68f26b7e54ef78f28ccb558dde7bca1` | 6965 |
| `verification/task44-addendum-C9-delegated-bypass-phase-machine.md` | `5aeeef0ba22e3aef15c7a3a116cd408d42a647455492833678353c338f31db40` | 2593 |
| `verification/task44-main-guard-diag-d8895bc.md` | `751bd18542b6d64d8d5bbb35a8c758cf6df0d706a37a27f1d70c23a64a810bf4` | 7325 |
| `verification/task44-tier2-brief-35b608f.md` | `bda088bb2aa1349af0283d20255e39ac000bc3adfcdb0541d81ff4873c981ffd` | 90860 |
| `verification/task44-tier2-brief-6bb03ca.md` | `e85db9de455c259a4f3e419c9269c6c2902c1ca1ea0b7145745b441d422ec79b` | 79958 |
| `verification/task44-tier2-brief-d8895bc.md` | `5a5493d80f824ece34029dd9f05bea0c28c4374c1735eb84ebc30f64d4fceb93` | 6109 |
| `verification/task44-tier2-brief-dda3481.md` | `fac3578341bafc539edcac1d33e7e27e21165f521466249454f186bd24eff734` | 57802 |
| `verification/task44-tier2-correction-35b608f.diff` | `1809627362567c7b6383f4541c5f8aa800c1523074e33376f6ea416f32bcf267` | 21413 |
| `verification/task44-tier2-cumulative-35b608f.diff` | `9578347ef9ac1ba09af3b4843fd406579350b82afe63359d589b412883db8701` | 54722 |
| `verification/task44-tier2-cumulative-6bb03ca.diff` | `f24cdfe65f05b849da2b7708e35464ff642f619a8669560bfbdcbd4fd7a85f68` | 55858 |
| `verification/task44-tier2-cumulative-dda3481.diff` | `8f175c99fa8516a79d7446c15a772b96d773161992cfcf45a3be157f668e962c` | 46605 |
| `verification/task44-tier2-dispatch-d8895bc-sol.txt` | `3516b9a1b6aa4df42bdd1cb300df25773c3319b824042579a1089780651689d4` | 1220 |
| `verification/task44-tier2-rename-6bb03ca.diff` | `f1b785df53e2f214a6914526b7f59a96d53461b695990c045174ec0806caa871` | 5307 |
| `verification/task44-tier2-verdict-35b608f-REQUEST-CHANGES.txt` | `ef71ed7f545ff748d40f3a9e341df401a43aa91a66662b7f33cd5285c88cd5b4` | 6460 |
| `verification/task44-tier2-verdict-6bb03ca-PASS.txt` | `87da514fb8ad56eeb36765933f97b755f6b2e36a5698a3f38def4a3382e7a3d8` | 4621 |
| `verification/task44-tier2-verdict-d8895bc-REQUEST-CHANGES.txt` | `6a501a7591e102221d0090c2aa28ba60f22c38639cbf798349a639b7a2039f49` | 5685 |
| `verification/task44-tier2-verdict-dda3481-PASS.txt` | `aa060439e4db8b72b8b3b6f66be23ab78b928db8a82c65de56f6230167e0c5b8` | 3330 |
| `verification/task44-tier2-verdict-ead2c32-PASS.txt` | `7dfd907a58244825c4c03cc1b8283877fd4fd6321db9c384b702f39466c14896` | 2528 |
| `verification/task44-tier2-verdict-ead2c32-provenance-correction.md` | `fc83d88a5083707120409137fd1bd2f218102d785855435a62f494d6fff1308a` | 3357 |
| `verification/tier2-dec20260911-01-3cb8841d-PASS.txt` | `382ea8e5a6bbb484444ddbb1493c7c115267aa7bdce655d2b241748d9b6805bb` | 1816 |
| `verification/tier2-dec20260911-01-3cb8841d-gemini-PASS.txt` | `acf88f9ee75778ce6c4d8f276eef23a240a2e1c3cc44c9dc47fbd76ca728f028` | 1910 |
| `verification/tier2-dec20260911-01-3cb8841d-minimax-PASS-WITH-ADVISORIES.txt` | `8ed5cc6bcf0fd70a994ed93a6aae707b59d746b2a112014f1374555d3b8faa84` | 14479 |
| `verification/tier2-dec20260911-01-ratification-2c0504d-PASS.txt` | `b59633ee98188ba64b019bc6af4c9d9e6cd8c5d1a3c017f684ffc94b8f668a8f` | 1866 |
| `verification/tier2-founder-os-pr332-4bb60c0-PASS.txt` | `061a98eb8d4a3fc2154c65a7eda17df7850a6cf3493e5ede81074bdc03d23b58` | 1937 |
| `verification/tier2-founder-os-pr333-7532d7c-PASS.txt` | `1312f8fd059817963f5a798bac05c62f858e86c3e46d4e8bd1ea11ff32a719c1` | 3262 |
| `verification/tier2-founder-os-pr333-fc5f447-ROUND1-PASS-adjudicated-defect.txt` | `cd720a989d58adcf025e9260a05a4ee688a057d95ca8b9cf2dacc0f8e21a4abb` | 2481 |
| `verification/tier2-m19-advisory-df19365-FAIL.txt` | `bf400cef666bc965baf408ff79031382d05da758c09b948d5fd13d0aef529074` | 5517 |
| `verification/tier2-m19-correction-9bcf015-FAIL.txt` | `c7e4b3de3dd0d241aff6384e101f4baeae66026223c5770453313cdb0cd2b80c` | 8521 |
| `verification/tier2-m19-preimpl-411500a3.txt` | `1b22f3fb1a4927b2d9a1ba65f6b305ca2451dba5e713254f260d6cc070deba5a` | 4996 |
| `verification/tier2-m19-r11-review-brief.md` | `def2215ac5ffb9ceed3e09028cbfa0aaea1b8d21f8134a37dc4204308091b6cc` | 42630 |
| `verification/tier2-m19-r11-round11.diff` | `6ddb6cd9f72f7d5413b632bd4f01e7d557d179252bb75a1d2a3726a1bedf3fcf` | 24547 |
| `verification/tier2-m19-r12-review-brief.md` | `cc8a17a65d28cc22b30aa1588041d6d2ce765fa2b7ba160f50721ca93c2d8617` | 39501 |
| `verification/tier2-m19-r12-round12.diff` | `7bfc73154407381b9085bcfbb02d39afb63817772c6e4fac493c98e9d329c4fb` | 15012 |
| `verification/tier2-m19-r8-review-brief.md` | `7ff0fb0216f2dea5122bf1d45a3ba8f338867a9ce550a0c6fd3896ca3d1a4997` | 57567 |
| `verification/tier2-m19-r8-round8.diff` | `401c419fb87e2295df9d9be6f82af4f93167f104c5900179d54636fe7f080114` | 40151 |
| `verification/tier2-m19-r9-review-brief.md` | `f732d2db36d1ddd33b4f1aea9256287ed2a8a28e45ee652e4ac5cfb7fd78e962` | 29017 |
| `verification/tier2-m19-r9-round9.diff` | `27a210753e59465705769e20f82080cce5bffc6f5e8acc4b9c1e2426577d737f` | 11326 |
| `verification/tier2-m19-remediation-4d2d14b-FAIL.txt` | `703dc1c14ec11bea8297f2039a185146ebfcdadac78aedf22d7e16516239ce54` | 8858 |
| `verification/tier2-m19-t42-remediation-6dc79e6.txt` | `9cc67b95d2c2d6d1cbe76f93a82eb96f03e02a341ac7ad60457426035edcf901` | 7632 |
| `verification/tier2-m19-t42-t43-1bd9679-PASS.txt` | `6e5c66d9e7dd230f9649f8cd3fdfb673af150628b5a1609afb5df608373be98b` | 7466 |
| `verification/tier2-m19-t42-t43-8585177-PASS.txt` | `ad1734b69b0ce73e91fc835ac6cc6c7b6acfedc12fe089f01b9f24bb041ae975` | 4261 |
| `verification/tier2-m19-t42-t43-96f2a1a-PASS.txt` | `e541240f5129a2919f532ce454c56d920eb09b643fae67d8aab7dc31b68dc273` | 8477 |
| `verification/tier2-m19-t42-t43-97c98f2-clean.txt` | `4cd03917cba860e9bd3008548b6708e12080200ba6d1afcba031fbdb7500e8b1` | 2499 |
| `verification/tier2-m19-t42-t43-b9e76ba-PASS-WITH-ADVISORIES.txt` | `ccf31ea5c3e80ccae009928b41ec4b79b9c56e9e76802ac422b229fe009f10d0` | 5465 |
| `verification/tier2-m19-t42-t43-ed85c18-PASS.txt` | `7c2351c9e1a7be08d546c4f1d0d1245a566e9c98199a65ba423714292958437c` | 6818 |
| `verification/tier2-m19-t42-t43-f157d136.txt` | `5bf91b7b2541aafb0349fc7641c86174a19508b68452f1ea7de553711d526052` | 7644 |
| `verification/tier2-m5task12-4df7749a-gemini-PASS.txt` | `684435a77d04e25bcae510669fa56a053ffc4072f1a651e26bb6e9a64de19ad4` | 5218 |
| `verification/tier2-m5task12-4df7749a-minimax-PASS.txt` | `54f41d3f57db6bd78cc7872580809f9125486420df1b9c79fb632e394b6c975b` | 12019 |
| `verification/tier2-m5task12-4f64b08-minimax-r3-PASS.txt` | `7b50cdf330f7275ed15fb5ec0027a66b47dd13f6c5a992c3ff467192c7855422` | 10148 |
| `verification/tier2-package-pr251-e9fffea.txt` | `f35360a2c233a373a93e6a9124d1aba1d12246e6b0bfbbb4d25d6cd55aebe0cd` | 19069 |
| `verification/tier2-pr252-6c572e5.txt` | `d1842a0fe4f59bb2982ebea3ef89fef25abd637eb0f5d751292297adc4b9dbbe` | 11459 |
| `verification/tier2-rereview-pr248-b23b1b7.txt` | `e1a848ee064cf53d070697c718767caf45ab87429be8f6b9e4d6d9291d083582` | 17876 |
| `verification/tier2-rereview-pr251-3d4d12f.txt` | `f11ed42bfe9df6df6ad1285bf0727dc6c29cc5b7293fae9112f341a8393f8ebd` | 1314 |
| `verification/tier2-rereview-pr251-3fa748f.txt` | `9d306d8db493400feda10b23ae5aad0d589029fbeebd4c83ac0538fe8814b062` | 12180 |
| `verification/tier2-rereview-pr251-8774e73.txt` | `944f615f6f036f86db0252cceba06284670887ecdd878c2750c74f1d0f4a16d2` | 3467 |
| `verification/tier2-seat-registry-v1.1-656cbee-minimax-CORRECTION-20260904.txt` | `e3bbc798eee1896bcd6feb5c2d41360e9802d49472376bba4d212d770753309a` | 3137 |
| `verification/tier2-seat-registry-v1.1-656cbee-minimax-PASS.txt` | `c37572f762af7d68a1db1cdc28be899f5daa2de7b15250d411b7b27609ec3315` | 6953 |
| `wf04-step1/HO-20260815-01-experience-architect-to-builder.md` | `ea984d45b49e57a20c3f3f573714ef682dcfd14e307e0bbf27224db18c8208e1` | 34323 |
| `wf04-step1/HO-20260815-01.committed` | `066281fb43320fea64b2942caf59df7bc66d36665600828f63bafa66fbe8462a` | 37708 |
| `wf04-step1/handoff-index.md.committed` | `7826b87d00185592f514d11da16cb29206da332912ceed717c38b22e4577a573` | 132516 |
| `wf04-step1/technical-architecture.md` | `f37a6265ce6baa0f14dd78815aea900a4cc30ce15be2d939a3a278205958ab62` | 79616 |
| `wf04-step1/technical-architecture.md.committed` | `7b009e91b97531d0c0b9295c4c3e2ed043138259cb525d233d8abf4d04542c49` | 93299 |
| `wf04-step1/wf04step1complete.diff` | `a142d8a170cbbe068ab9b6154f22283c91fac6e95e024faeeb29036af44d04b9` | 116021 |

## Verification

To check one artifact against this manifest:

```bash
cd ~/MADVenturesOPs/build-room
shasum -a 256 <path>   # compare against the row above
```

A mismatch means the artifact changed since this manifest was landed, or
the artifact is not the one this manifest describes. Either way it is a
finding, not a formatting problem.
