# Entegrasyonlar ve MCP Rehberi

Keyvotion Console, hem REST/GraphQL tabanlı servisleri hem de Model Context Protocol (MCP) sunucularını tek yerden bağlar. Hazır katalog: **64 entegrasyon** (toplam **195 yetenek**) + **60 MCP sunucusu** = **124 bağlantı şablonu**.

Bu dosyadaki tablolar `src/main/services/connection-presets.json` ve `integration-catalog.json` dosyalarından **`work/ldr-integrations-doc.js`** ile üretilir; elle düzenlenmez.

## Üç bağlanma yolu

1. **OAuth2** — "Bağlan" der, sağlayıcının sayfasında izin verirsin; anahtar girmezsin. Yerel callback (`127.0.0.1`) + `state` + PKCE kullanılır. Anahtar kullanıcıya hiç gösterilmez.
2. **API anahtarı / token** — sağlayıcının panelinden aldığın anahtarı yapıştırırsın. `safeStorage` (Windows DPAPI) ile şifrelenir; renderer'a geri dönmez. Her bağlantının **Test** düğmesi vardır.
3. **MCP kurulumu** — şablonu seç, gerekli alanları doldur; araç listesi çekilir ve her çağrı onay ister. Anahtar gerektirmeyen yerel sunucular (filesystem, memory, git…) doğrudan çalışır.

## Kategori dağılımı

| Kategori | Entegrasyon | MCP |
| --- | --- | --- |
| ai | 11 | 6 |
| cloud | 8 | 6 |
| code | 2 | 4 |
| commerce | 6 | 4 |
| communication | 11 | 5 |
| crm | 2 | 0 |
| data | 0 | 5 |
| files | 0 | 1 |
| media | 8 | 0 |
| observability | 4 | 5 |
| productivity | 12 | 14 |
| web | 0 | 10 |

## Entegrasyon kataloğu (64)

| # | Sağlayıcı | Kategori | Kimlik doğrulama | Yetenek |
| --- | --- | --- | --- | --- |
| 1 | GitHub | code | oauth2 | 3 |
| 2 | GitLab | code | token | 3 |
| 3 | Slack | communication | token | 3 |
| 4 | Discord | communication | token | 3 |
| 5 | Notion | productivity | token | 3 |
| 6 | Linear | productivity | token | 6 |
| 7 | Jira (Atlassian) | productivity | token | 3 |
| 8 | Figma | productivity | token | 3 |
| 9 | Telegram | communication | token | 3 |
| 10 | OpenAI | ai | token | 3 |
| 11 | Anthropic | ai | token | 3 |
| 12 | Ollama (yerel) | ai | anahtar yok | 3 |
| 13 | Supabase | cloud | token | 3 |
| 14 | Firebase | cloud | token | 3 |
| 15 | Vercel | cloud | token | 3 |
| 16 | Netlify | cloud | token | 3 |
| 17 | Cloudflare | cloud | token | 3 |
| 18 | PlanetScale | cloud | token | 3 |
| 19 | DigitalOcean | cloud | token | 3 |
| 20 | Heroku | cloud | token | 3 |
| 21 | Sentry | observability | token | 3 |
| 22 | Datadog | observability | token | 3 |
| 23 | Grafana Cloud | observability | token | 3 |
| 24 | PagerDuty | observability | token | 3 |
| 25 | Gmail | productivity | oauth2 | 3 |
| 26 | Google Drive | productivity | oauth2 | 3 |
| 27 | Google Calendar | productivity | oauth2 | 3 |
| 28 | Google Sheets | productivity | token | 3 |
| 29 | Box | productivity | token | 3 |
| 30 | OneDrive | productivity | token | 3 |
| 31 | Airtable | productivity | token | 3 |
| 32 | Asana | productivity | token | 3 |
| 33 | HubSpot | crm | token | 3 |
| 34 | Pipedrive | crm | token | 3 |
| 35 | Zoom | communication | token | 3 |
| 36 | Microsoft Teams | communication | token | 3 |
| 37 | Twilio | communication | basic | 3 |
| 38 | SendGrid | communication | token | 3 |
| 39 | Mailgun | communication | basic | 3 |
| 40 | Mailchimp | communication | basic | 3 |
| 41 | Intercom | communication | token | 3 |
| 42 | Zendesk | communication | basic | 3 |
| 43 | YouTube | media | token | 3 |
| 44 | Spotify | media | token | 3 |
| 45 | Reddit | media | token | 3 |
| 46 | Twitch | media | token | 3 |
| 47 | Mastodon | media | token | 3 |
| 48 | Bluesky | media | token | 3 |
| 49 | X | media | token | 3 |
| 50 | LinkedIn | media | token | 3 |
| 51 | Pinecone | ai | token | 3 |
| 52 | Qdrant Cloud | ai | token | 3 |
| 53 | Weaviate | ai | token | 3 |
| 54 | Hugging Face | ai | token | 3 |
| 55 | Replicate | ai | token | 3 |
| 56 | Groq | ai | token | 3 |
| 57 | Mistral AI | ai | token | 3 |
| 58 | Cohere | ai | token | 3 |
| 59 | Stripe | commerce | token | 3 |
| 60 | Shopify | commerce | token | 3 |
| 61 | PayPal | commerce | token | 3 |
| 62 | Square | commerce | token | 3 |
| 63 | Gumroad | commerce | token | 3 |
| 64 | Lemon Squeezy | commerce | token | 3 |

## MCP sunucuları (60)

| # | Sunucu | Kategori | Kimlik doğrulama | Şablon |
| --- | --- | --- | --- | --- |
| 1 | Filesystem | files | kurulum | filesystem |
| 2 | Git | code | kurulum | git |
| 3 | SQLite | data | kurulum | sqlite |
| 4 | PostgreSQL | data | kurulum | postgres |
| 5 | GitHub | code | kurulum | github |
| 6 | GitLab | code | kurulum | gitlab |
| 7 | Slack | communication | kurulum | slack |
| 8 | Notion | productivity | kurulum | notion |
| 9 | Linear | productivity | kurulum | linear |
| 10 | Google Maps | web | kurulum | google-maps |
| 11 | Fetch | web | kurulum | fetch |
| 12 | Puppeteer | web | kurulum | puppeteer |
| 13 | Playwright | web | kurulum | playwright |
| 14 | Memory | productivity | kurulum | memory |
| 15 | Sequential Thinking | productivity | kurulum | sequential-thinking |
| 16 | Time | productivity | kurulum | time |
| 17 | Everything | code | kurulum | everything |
| 18 | Sentry | observability | kurulum | sentry |
| 19 | Docker | cloud | kurulum | docker |
| 20 | Kubernetes | cloud | kurulum | kubernetes |
| 21 | AWS S3 | cloud | kurulum | aws-s3 |
| 22 | Cloudflare | cloud | kurulum | cloudflare |
| 23 | Vercel | cloud | kurulum | vercel |
| 24 | Supabase | cloud | kurulum | supabase |
| 25 | MongoDB | data | kurulum | mongodb |
| 26 | Redis | data | kurulum | redis |
| 27 | Elasticsearch | data | kurulum | elasticsearch |
| 28 | Brave Search | web | kurulum | brave-search |
| 29 | Exa | web | kurulum | exa |
| 30 | Tavily | web | kurulum | tavily |
| 31 | Firecrawl | web | kurulum | firecrawl |
| 32 | YouTube | web | kurulum | youtube |
| 33 | Spotify | web | kurulum | spotify |
| 34 | Gmail | productivity | kurulum | gmail |
| 35 | Google Drive | productivity | kurulum | google-drive |
| 36 | Google Calendar | productivity | kurulum | google-calendar |
| 37 | Stripe | commerce | kurulum | stripe |
| 38 | Shopify | commerce | kurulum | shopify |
| 39 | HubSpot | commerce | kurulum | hubspot |
| 40 | Salesforce | commerce | kurulum | salesforce |
| 41 | Airtable | productivity | kurulum | airtable |
| 42 | Trello | productivity | kurulum | trello |
| 43 | Asana | productivity | kurulum | asana |
| 44 | Jira | productivity | kurulum | jira |
| 45 | Confluence | productivity | kurulum | confluence |
| 46 | Figma | productivity | kurulum | figma |
| 47 | Discord | communication | kurulum | discord |
| 48 | Telegram | communication | kurulum | telegram |
| 49 | Twilio | communication | kurulum | twilio |
| 50 | SendGrid | communication | kurulum | sendgrid |
| 51 | OpenAI | ai | kurulum | openai |
| 52 | Anthropic | ai | kurulum | anthropic |
| 53 | Hugging Face | ai | kurulum | huggingface |
| 54 | Pinecone | ai | kurulum | pinecone |
| 55 | Qdrant | ai | kurulum | qdrant |
| 56 | Weaviate | ai | kurulum | weaviate |
| 57 | Grafana | observability | kurulum | grafana |
| 58 | Datadog | observability | kurulum | datadog |
| 59 | PagerDuty | observability | kurulum | pagerduty |
| 60 | Grafana Loki | observability | kurulum | grafana-loki |

## Örnek kullanım

- **Kod:** GitHub ile depo listele → "Depolarımı listele" yeteneği; bir depoya etiket ekle. GitLab aynı desenle çalışır.
- **İletişim:** Slack kanalına mesaj gönder; Discord sunucu bilgisi oku.
- **Verimlilik:** Notion sayfası oluştur, Linear'da sorun aç, Jira'da arama yap.
- **Yapay zeka:** OpenAI/Anthropic anahtarını gir → model listesini çek ve sohbet için kullan. Ollama yerelde anahtarsız çalışır.
- **Ticaret (yalnız `admin`):** Stripe/PayPal/Square/Gumroad/Lemon Squeezy ödeme ve ürün sorguları.
- **MCP:** `filesystem` ile proje klasörünü ara; `memory` ile kalıcı not tut; `git` ile depo durumunu oku.

## Kendi entegrasyonunu ekle

1. `integration-catalog.json` içine kayıt ekle: `id`, `name`, `category`, `auth`, `hosts` (beyaz liste), `health`, `fields`, `capabilities`.
2. `connection-presets.json` içine şablon ekle: `kind: "integration"`, `refId` aynı `id`, kategori ve `authMode`.
3. Testi yaz (`tests/integration/…`), kapıları çalıştır: `node work/tap-count.js tests`, `node tools/doctor.js`, `node tools/k3.js`, `node work/html-check.js`.

> Gizli bilgi kuralı: bu dosyaya gerçek anahtar, kullanıcı adı veya e-posta yazılmaz. Yalnız şablon ve ipucu.
