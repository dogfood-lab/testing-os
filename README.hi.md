<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.md">English</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português (BR)</a>
</p>

<p align="center">
  <img src="./assets/logo.png" alt="testing-os" width="280">
</p>

<div align="center">

# टेस्टिंग-ओएस

[![सीआई](https://github.com/dogfood-lab/testing-os/actions/workflows/ci.yml/badge.svg)](https://github.com/dogfood-lab/testing-os/actions/workflows/ci.yml)
[![पेजेस](https://github.com/dogfood-lab/testing-os/actions/workflows/pages.yml/badge.svg)](https://dogfood-lab.github.io/testing-os/)
[![डॉगफूड](https://img.shields.io/endpoint?url=https://raw.githubusercontent.com/dogfood-lab/testing-os/main/indexes/badges/dogfood-lab--testing-os--cli.json)](https://dogfood-lab.github.io/testing-os/handbook/read-model/)
[![लाइसेंस: एमआईटी](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![नोड](https://img.shields.io/badge/node-%3E%3D22-brightgreen)](package.json)

**एआई युग में परीक्षण के लिए ऑपरेटिंग सिस्टम**

*एआई-सहायक सॉफ़्टवेयर के लिए प्रोटोकॉल, प्रमाण भंडार और शिक्षण लूप।*

<!-- version:start -->
**v1.14.0** — वर्तमान रिलीज़। इसमें क्या शामिल किया गया है, यह देखने के लिए [CHANGELOG.md](CHANGELOG.md) देखें।
<!-- version:end -->

📖 **[हैंडबुक पढ़ें →](https://dogfood-lab.github.io/testing-os/handbook/)**

</div

---

## यह क्या है

`testing-os` आपके रिपॉजिटरी के वास्तविक परीक्षण प्रमाणों को एआई-आधारित वर्कफ़्लो में रिकॉर्ड, सत्यापित और सीखता है। इसे किसी रिपॉजिटरी पर इंगित करें, और प्रत्येक परीक्षण रन एक प्रमाण-पुष्टि रिकॉर्ड बन जाता है जिस पर आप भरोसा कर सकते हैं - यह स्वयं-रिपोर्ट किया गया पास नहीं है।

आपको क्या मिलता है:

- **प्रमाण-पुष्टि रिकॉर्ड।** प्रत्येक सबमिशन को वास्तविक सीआई रन से जोड़ा जाता है - प्रदाता की अपनी पहचान के माध्यम से, बिना किसी कुंजी के - इससे पहले कि इसे स्वीकार किया जाए। परिणाम एक छेड़छाड़-रोधी, केवल-जोड़ने वाला प्रमाण भंडार है, न कि एक सम्मान-आधारित हरा चेक।
- **एक नीति अनुबंध जिसे आप नियंत्रित करते हैं।** YAML में घोषित करें कि "सत्यापित" के रूप में क्या गिना जाता है - एक सीमित, गैर-मूल्यांकन प्रेडिकेट डीएसएल (`field`/`op`/`value` + `all`/`any`/`not`/`implies`) - और इसे अपने रिपॉजिटरी में लागू करें। `dogfood-verify lint` के साथ शिप करने से पहले एक नीति को जांचें।
- **एक समानांतर-एजेंट स्वार्म प्रोटोकॉल।** एक कोडबेस के खिलाफ बहु-एजेंट ऑडिट चलाएं, फिर कच्चे निष्कर्षों को पुन: प्रयोज्य पैटर्न और सिद्धांत में बदलें।
- **एक लाइव स्थिति सतह।** प्रति-रिपॉजिटरी रिकॉर्ड, इंडेक्स और एक स्थिति बैज, ये सभी एक प्रमाण भंडार से परोसे जाते हैं।
- **एक पृष्ठ जो बताता है कि एक रिपॉजिटरी कैसे काम करता है।** एटलस एक रिपॉजिटरी के वर्कफ़्लो, वे उपकरण जो यह चलाता है, इसकी आयात, लेखन और इतिहास को पढ़ता है, और `atlas/README.md` लिखता है: क्या आता है, क्या चलता है, यह कहां उतरता है, कौन इसे पढ़ता है, क्या क्या तोड़ता है, पिछली मानचित्र से क्या बदला है, कहां से शुरू करें। इसमें कोई भी वाक्य किसी व्यक्ति द्वारा नहीं लिखा गया है; `atlas check` तब सीआई विफल हो जाता है जब मानचित्र कोड से मेल खाना बंद कर देता है, `atlas explain <file>` उत्तर देता है कि एक फ़ाइल सिस्टम में क्या है, और प्रत्येक पुल अनुरोध को एक टिप्पणी के रूप में संरचनात्मक डेल्टा मिलता है।

यह [डॉगफूड लैब](https://github.com/dogfood-lab) संगठन का प्रमुख मोनोरेपो है - आठ `@dogfood-lab/*` पैकेज एक `swarm` सीएलआई और एक `atlas` सीएलआई के पीछे।

## त्वरित शुरुआत

```bash
npm install -g @dogfood-lab/dogfood-swarm
swarm --help
```

क्या आप चाहते हैं कि आपके अपने रिपॉजिटरी के परीक्षण प्रमाण यहां रिकॉर्ड किए जाएं? **[`examples/` स्टार्टर किट](examples/)** आपको पांच मिनट में शुरू करने में मदद करता है (`dogfood-report` सबमिशन बनाता है; `dogfood-init` वर्कफ़्लो को स्केलेट करता है)। ऑपरेटर का गाइड, सीएलआई संदर्भ, स्कीमा संदर्भ और एकीकरण व्यंजनों को **[हैंडबुक](https://dogfood-lab.github.io/testing-os/handbook/)** में पाया जा सकता है। प्रति-संस्करण विवरण [CHANGELOG.md](CHANGELOG.md) में है।

## खतरा मॉडल

टेस्टिंग-ओएस, `mcp-tool-shop-org/*` और `dogfood-lab/*` के तहत विश्वसनीय GitHub रिपॉजिटरी से `repository_dispatch` के माध्यम से भेजे गए डॉगफूड सबमिशन को संसाधित करता है। सत्यापनकर्ता को सीआई प्रमाण की आवश्यकता होती है - दावा किए गए रन आईडी को प्रदाता के एपीआई के माध्यम से पुष्टि की जाती है, और गलत आकार, गुम संदर्भ या अमान्य नीति दावों वाले सबमिशन को अस्वीकार कर दिया जाता है।

**प्रमाण ही सत्यापन है।** `github` सबमिशन के लिए, सत्यापनकर्ता पुष्टि करता है कि दावा किया गया GitHub क्रियाएं रन वास्तव में मौजूद है (GitHub API) और सबमिशन के `repo` और `commit_sha` को उस पुष्टि किए गए रन से जोड़ता है - एक लाइव, बिना कुंजी वाला जांच जो GitHub की अपनी ओआईडीसी पहचान में निहित है, इसलिए एक रिकॉर्ड किसी ऐसे रन या कमिट का प्रमाण नहीं दे सकता है जो नहीं हुआ। **GitLab CI** वैकल्पिक रूप से समर्थित है (`source.provider: gitlab`); एक GitLab सबमिशन एकमात्र मामला है जहां सत्यापनकर्ता एक गैर-GitHub होस्ट को कॉल करता है (`gitlab.com/api`), और केवल `gitlab` सबमिशन के लिए।

**रिकॉर्ड अखंडता छेड़छाड़-रोधी है, छेड़छाड़-प्रूफ नहीं।** प्रत्येक बने रहने वाले रिकॉर्ड में एक `integrity` ब्लॉक होता है (`submission_digest` + `prev_digest`) जो एक केवल-जोड़ने वाली हैश श्रृंखला बनाता है जिसे `node packages/ingest/run.js --verify-chain` पूरी तरह से ऑफ़लाइन में मान्य करता है - बैंड से बाहर छेड़छाड़, डिस्क भ्रष्टाचार और आंशिक पुनर्स्थापना का पता लगाता है। यह स्वयं इनजेस्ट क्रेडेंशियल के खिलाफ बचाव नहीं करता है, जो एक रिकॉर्ड और श्रृंखला दोनों को फिर से लिख सकता है; इसे बंद करने के लिए लेखक के नियंत्रण के बाहर एक एंकर की आवश्यकता होती है। एक **वैकल्पिक, डिफ़ॉल्ट रूप से बंद XRPL एंकर** (`node packages/ingest/run.js --anchor-*`) श्रृंखला के शीर्ष को सार्वजनिक एक्सआरपी लेज़र पर गवाह बनाता है, जिससे एंकर किए गए बिंदु के नीचे किसी भी संक्षिप्तीकरण या पुनर्लेखन का पता लगाया जा सकता है - गैर-GitHub कॉल, और केवल तभी जब कोई ऑपरेटर इसे सक्षम करता है।

**What testing-os touches:** the submission JSON in each `repository_dispatch` payload; `policies/`, `fixtures/`, `records/`, `indexes/`, and `dogfood/roadmap/` in this repo (the last written only by an operator-invoked `swarm roadmap compile` — never by the automated ingest path); outbound calls to `api.github.com` for provenance verification; and — for `github` submissions only — a read-only fetch of the submitting repo's `dogfood/scenarios/<scenario_id>.yaml` at the attested commit (the scenario definition that powers required-steps enforcement; size-capped and schema-validated before use, absent files simply leave that check unenforced with a visible warning).

**टेस्टिंग-ओएस क्या नहीं छूता है:** घोषित `dogfood/scenarios/` परिभाषा फ़ाइलों से परे उपभोक्ता स्रोत कोड, उपभोक्ता रिपॉजिटरी में गुप्त, या इस रिपॉजिटरी के कार्यशील ट्री के बाहर कुछ भी।

**निष्कर्ष-आधारित परिवर्तन प्रमाण प्रस्तुत करते हैं और केवल जोड़ने की अनुमति देते हैं।** स्वार्म नियंत्रण तल के समापन क्रियाएँ (`swarm reopen`, `swarm close`) को एक स्पष्ट कारण, प्रमाण और — ऑपरेटर समापन के लिए — घोषित सत्यापन मोड की आवश्यकता होती है; प्रत्येक परिवर्तन एक अपरिवर्तनीय `finding_events` पंक्ति लिखता है जो कार्य करने वाले प्राधिकरण को रिकॉर्ड करता है। कोई स्वचालित पथ पुरानी जानकारी के आधार पर निष्कर्ष को बंद नहीं कर सकता या भविष्यवाणी के आधार पर उसे फिर से नहीं खोल सकता, और कोई भी क्रिया घटना इतिहास को फिर से नहीं लिख सकती — गलत तरीके से उपयोग किए गए क्रेडेंशियल परिवर्तनों को जोड़ सकते हैं, लेकिन प्रत्येक जोड़ स्वयं रिकॉर्ड में होता है।

**नेटवर्क सतह।** डिफ़ॉल्ट रूप से, एकमात्र आउटगोइंग कनेक्शन `api.github.com` है (केवल-पढ़ने के लिए: उत्पत्ति की पुष्टि + ऊपर दी गई परिदृश्य-परिभाषा प्राप्त करना)। दोनों अपवाद वैकल्पिक हैं और ऊपर बताए गए हैं: एक GitLab-प्रदाता सबमिशन (`gitlab.com/api`), और एक ऑपरेटर-सक्षम XRPL एंकर रन। **कोई टेलीमेट्री नहीं, कोई विश्लेषण नहीं — यह कोडबेस कभी भी स्वचालित रूप से डेटा नहीं भेजता; उन दो वैकल्पिक पथों के अभाव में, यह GitHub से परे कोई नेटवर्क सतह उजागर नहीं करता है।** रिसीवर वर्कफ़्लो `contents: write` के साथ चलता है, जो केवल इस रिपॉजिटरी तक सीमित है।

## पैकेज

| पैकेज | स्रोत | उद्देश्य |
|---------|--------|---------|
| `@dogfood-lab/schemas` | टाइपस्क्रिप्ट | 8 JSON स्कीमा (रिकॉर्ड, निष्कर्ष, पैटर्न, अनुशंसा, सिद्धांत, नीति, परिदृश्य, सबमिशन)। |
| `@dogfood-lab/verify` | JS | केंद्रीय सबमिशन सत्यापनकर्ता। सबमिशन यहां से गुजरते हैं इससे पहले कि उन्हें स्थायी रूप से संग्रहीत किया जाए। |
| `@dogfood-lab/findings` | JS | निष्कर्ष अनुबंध + व्युत्पन्न/समीक्षा/संश्लेषण/सलाह पाइपलाइन। |
| `@dogfood-lab/ingest` | JS | पाइपलाइन ग्लू: डिस्पैच → सत्यापित करें → स्थायी करें → अनुक्रमित करें। |
| `@dogfood-lab/report` | JS | स्रोत रिपॉजिटरी के लिए सबमिशन बिल्डर। |
| `@dogfood-lab/portfolio` | JS | क्रॉस-रिपॉजिटरी पोर्टफोलियो जनरेटर। |
| `@dogfood-lab/dogfood-swarm` | JS | 10-चरण समानांतर-एजेंट प्रोटोकॉल + SQLite नियंत्रण तल + `swarm` बिन। |
| `@dogfood-lab/atlas` | JS | एक रिपॉजिटरी पढ़ता है और उस पृष्ठ को लिखता है जिसमें बताया गया है कि यह कैसे काम करता है (`atlas/README.md`); `atlas check` CI में मानचित्र को नियंत्रित करता है। कोई भी संबंधित निर्भरता नहीं; किसी भी रिपॉजिटरी में चलता है। |

भाई परीक्षण उपकरण जो **स्वतंत्र रहते हैं** लेकिन प्रकाशित API के माध्यम से एकीकृत होते हैं: [`shipcheck`](https://github.com/mcp-tool-shop-org/shipcheck), [`repo-knowledge`](https://github.com/mcp-tool-shop-org/repo-knowledge), [`ai-eyes-mcp`](https://github.com/mcp-tool-shop-org/ai-eyes-mcp), [`taste-engine`](https://github.com/mcp-tool-shop-org/taste-engine), [`style-dataset-lab`](https://github.com/mcp-tool-shop-org/style-dataset-lab)।

## लेआउट

```
testing-os/
├── packages/                  # 8 workspace packages (@dogfood-lab/*)
├── atlas/                     # This repository's own Atlas page and map, written by `atlas map`
├── site/                      # Astro Starlight handbook → dogfood-lab.github.io/testing-os/handbook/
├── swarms/                    # Swarm-run artifacts + control-plane.db
├── indexes/                   # Generated read API: latest-by-repo.json, failing.json, stale.json, trends.json, badges/ (shields.io endpoints)
├── policies/                  # Policy YAML by repo
├── records/                   # Submission landing pad (ingest.yml writes here)
├── fixtures/                  # Test/example fixtures
├── docs/                      # Contract docs + architecture notes
├── examples/                  # Copy-paste consumer starter kit (dogfood.yml + scenario + policy)
├── scripts/                   # Repo-level utilities (sync-version, build)
└── .github/workflows/         # ci.yml, ingest.yml, pages.yml, release.yml, self-dogfood.yml, atlas-render.yml
```

## स्थानीय विकास

```bash
git clone https://github.com/dogfood-lab/testing-os.git
cd testing-os
npm install
npm run build       # tsc --build across all packages
npm test            # vitest for schemas, node --test for the rest
npm run verify      # version-sync + doc-drift + regression-pin gates + build + tests (canonical pre-commit check — NOT the same as build && test)
```

Node ≥ 22 की आवश्यकता है। CI मैट्रिक्स `ubuntu-latest` पर Node 22 + 24 चलाता है; स्थानीय रूप से Node 25 पर मान्य किया गया।

**समर्थित फ़ाइल सिस्टम:** APFS, HFS+, ext4 (CI आधार रेखा), NTFS — कोई भी जो POSIX `link(2)` को लागू करता है। **समर्थित नहीं:** exFAT, FAT32। [`packages/findings/lib/file-lock.js`](packages/findings/lib/file-lock.js) में फ़ाइल-लॉक CAS को परमाणु प्रकाशन के लिए हार्डलिंक सिमेंटिक्स की आवश्यकता होती है; exFAT पर, `linkSync` `ENOTSUP` उत्पन्न करता है (जोरदार, मौन नहीं)। एक सामान्य समस्या: क्रॉस-प्लेटफ़ॉर्म बाहरी SSD अक्सर exFAT में स्वरूपित होते हैं — रिपॉजिटरी को स्थानीय APFS/HFS+ पर क्लोन करें। पूर्ण सत्र G सत्यापन मैट्रिक्स के लिए [`docs/m5-validation-2026-04-29.md`](docs/m5-validation-2026-04-29.md) देखें।

## संस्करण नियंत्रण

सभी `@dogfood-lab/*` पैकेज एक साथ अपडेट होते हैं — मोनोरिपो में एक संख्या। सात पैकेज v1.14.0 पर `@dogfood-lab` के तहत npm पर एक साथ प्रकाशित होते हैं (`schemas`, `verify`, `report`, `ingest`, `findings`, `dogfood-swarm`, `atlas`); आठवां, `@dogfood-lab/portfolio`, आंतरिक रहता है। इस README के शीर्ष के पास संस्करण पंक्ति हर `npm run build` पर [`scripts/sync-version.mjs`](scripts/sync-version.mjs) के माध्यम से `package.json` से स्वचालित रूप से मुद्रित होती है।

## लाइसेंस

[MIT](LICENSE) © 2026 mcp-tool-shop

---

<div align="center">

**[हैंडबुक](https://dogfood-lab.github.io/testing-os/handbook/)** · **[सभी रिपॉजिटरी](https://github.com/orgs/dogfood-lab/repositories)** · **[प्रोफ़ाइल](https://github.com/dogfood-lab)**

*पहले खाओ। बाद में शिप करो।*

</div
