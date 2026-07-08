#!/usr/bin/env python3
"""
cardRenderer.py v4
- Light/dark professional theme (dark navy, not near-black)
- Gradient drawn FIRST before all content (bug fix from v3)
- Full 1920px height utilised
"""
import sys, json, os, textwrap
from datetime import date
from PIL import Image, ImageDraw, ImageFont

W, H = 1080, 1920
FONT_BOLD = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
FONT_REG  = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"

def font(path, size):
    try: return ImageFont.truetype(path, size)
    except: return ImageFont.load_default()

def hex_rgb(h):
    h = h.lstrip("#")
    return tuple(int(h[i:i+2],16) for i in (0,2,4))

def wrap(text, n):
    return textwrap.wrap(str(text or ""), width=n) or [""]

def make_canvas(top, bot):
    """Gradient background — MUST be called first, returns fresh image."""
    img  = Image.new("RGB", (W,H), top)
    draw = ImageDraw.Draw(img)
    for y in range(H):
        t = y/H
        c = tuple(int(top[i]+(bot[i]-top[i])*t) for i in range(3))
        draw.line([(0,y),(W,y)], fill=c)
    return img

def draw_centered(draw, text, f, y, fg, shadow=(0,0,0)):
    bb = draw.textbbox((0,0), text, font=f)
    x  = (W-(bb[2]-bb[0]))//2
    draw.text((x+2,y+2), text, font=f, fill=shadow)
    draw.text((x,y), text, font=f, fill=fg)
    return bb[3]-bb[1]

def draw_left(draw, text, f, x, y, fg, shadow=(0,0,0)):
    draw.text((x+2,y+2), text, font=f, fill=shadow)
    draw.text((x,y), text, font=f, fill=fg)
    bb = draw.textbbox((0,0), text, font=f)
    return bb[3]-bb[1]

# ── COLOUR SCHEMES ──────────────────────────────────────────────────────────
# Using visible-dark navy (not near-black) for professional look
HOOK_BG   = ((22, 16, 35),  (38, 26, 55))   # deep purple-navy
RED_BG    = ((28, 12, 12),  (45, 18, 18))   # dark red
BLUE_BG   = ((12, 18, 45),  (18, 28, 68))   # navy blue
GREEN_BG  = ((12, 28, 16),  (16, 42, 22))   # dark green
AMBER_BG  = ((38, 26, 8),   (55, 38, 12))   # dark amber
CTA_BG    = ((14, 16, 38),  (22, 24, 58))   # deep blue

SCHEMES = {
    "red":   (RED_BG,   (220,38,38)),
    "blue":  (BLUE_BG,  (59,130,246)),
    "green": (GREEN_BG, (34,197,94)),
    "amber": (AMBER_BG, (245,158,11)),
}

# ── HOOK CARD ───────────────────────────────────────────────────────────────
def render_hook(cfg, out):
    A        = hex_rgb(cfg.get("accent","#DC2626"))
    headline = str(cfg.get("headline",""))[:80]
    subtext  = str(cfg.get("subtext",""))[:130]
    big_num  = str(cfg.get("big_number",""))[:18]
    tag      = str(cfg.get("tag","BREAKING"))[:30]

    img  = make_canvas(*HOOK_BG)           # gradient FIRST
    draw = ImageDraw.Draw(img)

    # Left accent bar
    draw.rectangle([0,0,8,H], fill=A)
    # Top black bar
    draw.rectangle([0,0,W,115], fill=(8,6,10))

    # Channel name
    f_ch = font(FONT_BOLD, 40)
    draw_centered(draw, "\u26a1  EcoAnalyzer", f_ch, 34, (255,255,255), (0,0,0))

    # Divider under top bar
    draw.rectangle([0,115,W,119], fill=A)

    # Live dot + tag badge
    f_tag = font(FONT_BOLD, 32)
    tb    = draw.textbbox((0,0), tag, font=f_tag)
    bx,by = 80, 158
    draw.ellipse([bx-38,by-2,bx-18,by+18], fill=A)   # live dot
    draw.rectangle([bx-4,by-10, bx+(tb[2]-tb[0])+14, by+(tb[3]-tb[1])+10], fill=A)
    draw.text((bx,by), tag, font=f_tag, fill=(255,255,255))

    # Divider
    draw.rectangle([80,358,W-80,362], fill=(*A[:3],))

    y = 395

    # Big number
    if big_num:
        f_num = font(FONT_BOLD, 162)
        nb    = draw.textbbox((0,0), big_num, font=f_num)
        nx    = (W-(nb[2]-nb[0]))//2
        # Glow shadow
        for dx,dy2 in [(-5,-5),(5,-5),(-5,5),(5,5)]:
            draw.text((nx+dx,y+dy2), big_num, font=f_num,
                      fill=tuple(max(0,c//4) for c in A))
        draw.text((nx,y), big_num, font=f_num, fill=A)
        y += (nb[3]-nb[1]) + 25

    # Headline
    f_hl = font(FONT_BOLD, 72)
    for line in wrap(headline, 18)[:3]:
        h = draw_centered(draw, line, f_hl, y, (255,255,255), (0,0,0))
        y += h + 18

    # Accent line
    y += 20
    draw.rectangle([W//2-90,y,W//2+90,y+5], fill=A)
    y += 38

    # Subtext
    f_sub = font(FONT_REG, 48)
    for line in wrap(subtext, 28)[:3]:
        bb = draw.textbbox((0,0), line, font=f_sub)
        draw.text(((W-(bb[2]-bb[0]))//2,y), line, font=f_sub, fill=(195,182,210))
        y += (bb[3]-bb[1]) + 16

    # ── Centre visual: date ring ──
    cy = max(y+110, 1170)
    for i in range(180,155,-1):
        alpha = (180-i)/25*0.5
        c = tuple(int(ac*alpha) for ac in A)
        draw.ellipse([W//2-i,cy-i,W//2+i,cy+i], outline=c)
    draw.ellipse([W//2-105,cy-105,W//2+105,cy+105],
                 fill=tuple(max(8,c//5) for c in A))
    f_dt = font(FONT_BOLD,40)
    dt   = date.today().strftime("%b %d").upper()
    draw_centered(draw, dt, f_dt, cy-26, A, (0,0,0))
    f_yr = font(FONT_REG, 30)
    yr   = date.today().strftime("%Y")
    draw_centered(draw, yr, f_yr, cy+22, tuple(int(c*0.7) for c in A))

    # ── Three indicator dots ──
    dot_y = H-198
    for i,(cx2,filled) in enumerate([(W//2-140,True),(W//2,False),(W//2+140,False)]):
        r2 = 12 if filled else 8
        draw.ellipse([cx2-r2,dot_y-r2,cx2+r2,dot_y+r2],
                     fill=A if filled else tuple(c//3 for c in A))

    # ── Bottom CTA bar ──
    draw.rectangle([0,H-118,W,H], fill=(8,6,10))
    draw.rectangle([0,H-120,W,H-116], fill=A)
    f_cta = font(FONT_BOLD,33)
    cta   = "\U0001f446  FOLLOW  \u2022  SUBSCRIBE  \u2022  @EcoAnalyzer"
    draw_centered(draw, cta, f_cta, H-86, (215,210,225), (0,0,0))
    draw.rectangle([0,H-4,W,H], fill=A)

    img.save(out, quality=95)

# ── ANALYSIS CARD ────────────────────────────────────────────────────────────
def render_analysis(cfg, out):
    scheme   = cfg.get("scheme","blue")
    bgs, A   = SCHEMES.get(scheme, SCHEMES["blue"])
    headline = str(cfg.get("headline",""))[:90]
    body     = str(cfg.get("body",""))[:200]
    tag      = str(cfg.get("tag","ANALYSIS"))[:30]
    num      = str(cfg.get("num","01"))[:3]
    stat     = str(cfg.get("stat",""))[:80]

    img  = make_canvas(*bgs)              # gradient FIRST
    draw = ImageDraw.Draw(img)

    draw.rectangle([0,0,8,H], fill=A)
    draw.rectangle([0,0,W,115], fill=(8,6,10))
    draw.rectangle([0,115,W,119], fill=A)

    # Channel name
    f_ch = font(FONT_BOLD,36)
    draw_centered(draw, "EcoAnalyzer", f_ch, 38, (255,255,255), (0,0,0))

    # Faded large number
    f_nbg = font(FONT_BOLD,280)
    nb    = draw.textbbox((0,0), num, font=f_nbg)
    draw.text((W-(nb[2]-nb[0])-25, 75), num, font=f_nbg,
              fill=tuple(max(8,c//9) for c in A))

    # Tag badge
    f_tag = font(FONT_BOLD,30)
    tb    = draw.textbbox((0,0), tag, font=f_tag)
    bx,by = 80,158
    draw.rectangle([bx-12,by-8,bx+(tb[2]-tb[0])+12,by+(tb[3]-tb[1])+8], fill=A)
    draw.text((bx,by), tag, font=f_tag, fill=(255,255,255))
    draw.rectangle([80,238,W-80,242], fill=A)

    y = 272

    # Headline
    f_hl = font(FONT_BOLD,66)
    for line in wrap(headline,20)[:3]:
        h = draw_left(draw, line, f_hl, 80, y, (255,255,255), (0,0,0))
        y += h+16

    y += 16
    draw.rectangle([80,y,155,y+5], fill=A)
    y += 38

    # Body
    f_body = font(FONT_REG,48)
    for line in wrap(body,25)[:5]:
        h = draw_left(draw, line, f_body, 80, y, (195,185,212))
        y += h+16

    # Dotted separator
    y += 38
    for x2 in range(80,W-80,28):
        draw.rectangle([x2,y,x2+14,y+3], fill=tuple(c//2 for c in A))
    y += 48

    # Stat box
    if stat:
        draw.rectangle([60,y,W-60,y+5], fill=A)
        draw.rectangle([60,y,66,y+145], fill=A)
        f_stat = font(FONT_BOLD,44)
        sy = y+18
        for line in wrap(stat,25)[:3]:
            h = draw_left(draw, line, f_stat, 90, sy, (235,228,242))
            sy += h+10
        draw.rectangle([60,sy+10,W-60,sy+15], fill=A)
        y = sy+58

    # Sector bars — fill lower portion
    bar_y = max(y+40, 1345)
    secs  = ["TRADE","MARKETS","ECONOMY","INVESTMENT","GROWTH"]
    wgts  = [0.85,0.65,0.75,0.55,0.45]
    f_sec = font(FONT_REG,30)
    for sec,w in zip(secs,wgts):
        bw = int((W-200)*w)
        draw.rectangle([80,bar_y,80+bw,bar_y+38],
                       fill=tuple(max(8,int(c*(0.22+w*0.28))) for c in A))
        draw.text((92,bar_y+6), sec, font=f_sec,
                  fill=tuple(min(255,int(c*1.2)) for c in A))
        pct = f"{int(w*100)}%"
        pp  = draw.textbbox((0,0),pct,font=f_sec)
        draw.text((80+bw-(pp[2]-pp[0])-8,bar_y+6), pct, font=f_sec, fill=(200,195,212))
        bar_y += 70

    # Bottom bar
    draw.rectangle([0,H-118,W,H], fill=(8,6,10))
    draw.rectangle([0,H-120,W,H-116], fill=A)
    f_bt = font(FONT_BOLD,32)
    draw_centered(draw, "\u26a1  EcoAnalyzer  \u2022  Economic Analysis",
                  f_bt, H-86, (180,175,198), (0,0,0))
    draw.rectangle([0,H-4,W,H], fill=A)

    img.save(out, quality=95)

# ── CTA CARD ─────────────────────────────────────────────────────────────────
def render_cta(cfg, out):
    A     = hex_rgb(cfg.get("accent","#3B82F6"))
    outro = str(cfg.get("outro","Follow EcoAnalyzer for daily economic insights"))[:100]

    img  = make_canvas(CTA_BG[0], CTA_BG[1])
    draw = ImageDraw.Draw(img)

    draw.rectangle([0,0,8,H], fill=A)

    # TOP BAR — clean
    draw.rectangle([0,0,W,225], fill=(8,6,10))
    draw.rectangle([0,225,W,229], fill=A)
    f_ch = font(FONT_BOLD, 44)
    draw_centered(draw, "⚡ EcoAnalyzer", f_ch, 80, (255,255,255), (0,0,0))
    f_sl = font(FONT_REG, 32)
    draw_centered(draw, "Global economics. Simply explained.", f_sl, 140, tuple(int(c*0.7) for c in A))

    # LARGE RING
    cy2 = 680
    for i in range(350,325,-1):
        alpha = (350-i)/25*0.45
        c = tuple(int(ac*alpha) for ac in A)
        draw.ellipse([W//2-i,cy2-i,W//2+i,cy2+i], outline=c)
    draw.ellipse([W//2-240,cy2-240,W//2+240,cy2+240],
                 fill=tuple(max(8,c//10) for c in A))

    # Outro text in ring
    f_outro = font(FONT_BOLD, 60)
    lines   = wrap(outro, 14)[:3]
    for i,line in enumerate(lines):
        bb = draw.textbbox((0,0),line,font=f_outro)
        yl = cy2-((len(lines)-1)*80)//2+i*80-40
        draw.text(((W-(bb[2]-bb[0]))//2,yl), line, font=f_outro, fill=(255,255,255))

    # DIVIDER
    for x2 in range(80,W-80,28):
        draw.rectangle([x2,1100,x2+14,1103], fill=tuple(c//2 for c in A))

    # WHAT WE OFFER — 3 clean points
    f_pt = font(FONT_REG, 48)
    pts  = [
        "✓  Daily global economic analysis",
        "✓  Powered by AI — always current",
        "✓  Free. No paywalls. Ever.",
    ]
    for i,pt in enumerate(pts):
        bb = draw.textbbox((0,0),pt,font=f_pt)
        draw.text(((W-(bb[2]-bb[0]))//2, 1150+i*80), pt, font=f_pt, fill=(200,195,220))

    # SUBSCRIBE BUTTON — clean
    btn_y = 1550
    draw.rectangle([80,btn_y,W-80,btn_y+140], fill=A)
    f_btn = font(FONT_BOLD, 54)
    draw_centered(draw,"👆  FOLLOW @EcoAnalyzer",
                  f_btn, btn_y+42, (255,255,255), (0,0,0))

    # Platform icons row
    f_pl = font(FONT_REG, 36)
    platforms = "YouTube  •  Facebook  •  Instagram"
    bb_p = draw.textbbox((0,0), platforms, font=f_pl)
    draw.text(((W-(bb_p[2]-bb_p[0]))//2, btn_y+165), platforms, font=f_pl,
              fill=tuple(int(c*0.8) for c in A))

    # BOTTOM BAR
    draw.rectangle([0,H-90,W,H], fill=(8,6,10))
    draw.rectangle([0,H-92,W,H-88], fill=A)
    f_dis = font(FONT_REG, 26)
    dis   = "Educational purposes only  •  Not financial advice"
    bb_d  = draw.textbbox((0,0),dis,font=f_dis)
    draw.text(((W-(bb_d[2]-bb_d[0]))//2,H-66),dis,font=f_dis,fill=(80,75,100))
    draw.rectangle([0,H-4,W,H], fill=A)

    img.save(out, quality=95)

# ── CLI ──────────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: python3 cardRenderer.py config.json output_dir", file=sys.stderr)
        sys.exit(1)
    with open(sys.argv[1]) as f:
        config = json.load(f)
    output_dir = sys.argv[2]
    os.makedirs(output_dir, exist_ok=True)
    results = []
    for i,card in enumerate(config.get("cards",[])):
        out = os.path.join(output_dir, f"card_{i:02d}.jpg")
        t   = card.get("type","analysis")
        if   t == "hook": render_hook(card, out)
        elif t == "cta":  render_cta(card, out)
        else:             render_analysis(card, out)
        results.append({"index":i,"path":out,"type":t})
        print(f"✅ Card {i+1}/{len(config['cards'])}: {t}", flush=True)
    print("RESULT:"+json.dumps(results))
