# eşitleyici (katman 3) PSL kuralı — psl-py.log bu betiğin çıktısı (venv: pip install tldextract)
import tldextract, importlib.metadata as m
ex = tldextract.TLDExtract(suffix_list_urls=(), cache_dir=None, include_psl_private_domains=True)  # ağ yok, pakete gömülü PSL
print('tldextract', m.version('tldextract'))
def reg(h):
    r = ex(h); return r.top_domain_under_public_suffix if hasattr(r,'top_domain_under_public_suffix') else r.registered_domain
for h in ['org.tr','gov.tr','com','oka.org.tr','panel.oka.org.tr','github.io','ajans.github.io','panel.ajans.github.io','localhost']:
    d = reg(h) or None
    print(f"{h:22} kayıtlı={str(d):18} rev4: {'ret' if d is None or d == h else 'kabul'}")
