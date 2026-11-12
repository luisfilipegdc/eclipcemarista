"""Gera as texturas procedurais (Terra, nuvens, luzes noturnas, Lua) usadas pelo app.

Uso:  pip install numpy pillow global-land-mask
      python3 tools/gerar_texturas.py
Os contornos dos continentes vêm do pacote global-land-mask (dados públicos GLOBE/NOAA).
"""
import numpy as np
from PIL import Image, ImageFilter
from global_land_mask import globe
import os

OUT = os.path.join(os.path.dirname(__file__), "..", "assets")
W, H = 2048, 1024
rng = np.random.default_rng(42)

lat = np.linspace(90, -90, H)[:, None] * np.ones((1, W))
lon = np.linspace(-180, 180, W)[None, :] * np.ones((H, 1))
la, lo = np.radians(lat), np.radians(lon)
# coordenadas 3D na esfera -> ruído sem emenda
X, Y, Z = np.cos(la) * np.cos(lo), np.sin(la), np.cos(la) * np.sin(lo)

def _vnoise(x, y, z, seed):
    r = np.random.default_rng(seed)
    perm = r.permutation(256)
    perm = np.concatenate([perm, perm])
    vals = r.random(256)
    xi, yi, zi = np.floor(x).astype(int), np.floor(y).astype(int), np.floor(z).astype(int)
    xf, yf, zf = x - xi, y - yi, z - zi
    u, v, w = [t * t * (3 - 2 * t) for t in (xf, yf, zf)]
    def h(a, b, c):
        return vals[perm[(perm[(perm[a & 255] + b) & 255] + c) & 255]]
    res = 0
    for dx in (0, 1):
        for dy in (0, 1):
            for dz in (0, 1):
                wgt = (u if dx else 1 - u) * (v if dy else 1 - v) * (w if dz else 1 - w)
                res = res + wgt * h(xi + dx, yi + dy, zi + dz)
    return res

def fbm(x, y, z, octaves=6, base=2.0, seed=0):
    tot, amp, f, norm = 0, 1.0, base, 0
    for o in range(octaves):
        tot = tot + amp * _vnoise(x * f + 17.1 * o, y * f, z * f, seed + o)
        norm += amp
        amp *= 0.5
        f *= 2.0
    return tot / norm

def save(arr, name, mode="RGB"):
    Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8), mode).save(os.path.join(OUT, name), optimize=True)
    print("ok", name)

# ---------------- Terra (dia) ----------------
land = globe.is_land(np.clip(lat, -89.99, 89.99), np.clip(lon, -179.99, 179.99)).astype(np.float32)
landImg = Image.fromarray((land * 255).astype(np.uint8))
coast = np.asarray(landImg.filter(ImageFilter.GaussianBlur(10))) / 255.0
n1 = fbm(X, Y, Z, 6, 3.0, 1)
n2 = fbm(X, Y, Z, 5, 8.0, 9)

ocean_deep = np.array([8, 30, 78])
ocean_shallow = np.array([30, 92, 140])
ocean = ocean_deep + (ocean_shallow - ocean_deep) * np.clip(coast * 1.6, 0, 1)[..., None]
ocean = ocean * (0.9 + 0.2 * n2[..., None])

abslat = np.abs(lat)
green = np.array([52, 96, 40]); forest = np.array([28, 70, 30]); desert = np.array([196, 168, 112]); tundra = np.array([120, 116, 90])
desertness = np.exp(-((abslat - 24) / 9) ** 2) * np.clip((n1 - 0.35) * 3, 0, 1)
tropical = np.exp(-(abslat / 14) ** 2)
landc = green + (forest - green) * tropical[..., None]
landc = landc + (desert - landc) * desertness[..., None]
landc = landc + (tundra - landc) * np.clip((abslat - 52) / 14, 0, 1)[..., None]
landc = landc * (0.75 + 0.5 * n2[..., None])
ice = np.clip((abslat - 66) / 6, 0, 1) * land + np.clip((abslat - 76) / 4, 0, 1)
ice = np.clip(ice + (np.clip((n1 - 0.5) * 4, 0, 1) * np.clip((abslat - 60) / 10, 0, 1) * land), 0, 1)
earth = ocean * (1 - land[..., None]) + landc * land[..., None]
earth = earth + (np.array([235, 240, 245]) - earth) * ice[..., None]
save(earth, "terra_dia.jpg")

# ---------------- Luzes noturnas ----------------
cities = (rng.random((H, W)) < 0.012).astype(np.float32) * land
cities *= np.clip(1 - (abslat - 55) / 15, 0, 1) * np.clip((abslat - 0) / 1, 0, 1)
dens = np.clip((fbm(X, Y, Z, 4, 6.0, 33) - 0.45) * 4, 0, 1) * land
cities = cities * (0.3 + dens * 2.5)
cimg = Image.fromarray((np.clip(cities, 0, 1) * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(1.2))
c = np.asarray(cimg) / 255.0 * 3.0 + dens * 0.10
lights = np.stack([255 * c, 200 * c, 120 * c], -1)
save(lights, "terra_noite.jpg")

# ---------------- Nuvens ----------------
cl = fbm(X * 1.0, Y * 3.0, Z * 1.0, 7, 3.5, 77)
band = 0.55 + 0.25 * np.exp(-((abslat - 60) / 12) ** 2) + 0.15 * np.exp(-(abslat / 8) ** 2)
clouds = np.clip((cl - (1.12 - band)) * 3.0, 0, 1)
save(clouds * 255, "terra_nuvens.png", "L")

# ---------------- Lua ----------------
MW, MH = 1024, 512
mlat = np.linspace(90, -90, MH)[:, None] * np.ones((1, MW))
mlon = np.linspace(-180, 180, MW)[None, :] * np.ones((MH, 1))
mla, mlo = np.radians(mlat), np.radians(mlon)
mx, my, mz = np.cos(mla) * np.cos(mlo), np.sin(mla), np.cos(mla) * np.sin(mlo)
base = 150 + 50 * (fbm(mx, my, mz, 6, 4.0, 5) - 0.5) * 2
maria = np.clip((fbm(mx, my, mz, 4, 1.6, 12) - 0.52) * 5, 0, 1) * (mz > -0.2)
base = base - 75 * maria
P = np.stack([mx, my, mz], -1)
for i in range(260):
    d = rng.normal(size=3); d /= np.linalg.norm(d)
    rad = 0.012 + 0.10 * rng.random() ** 3
    ang = np.arccos(np.clip(P @ d, -1, 1)) / rad
    rim = np.exp(-((ang - 1.0) / 0.18) ** 2) * 12
    bowl = np.where(ang < 1.0, -16 * (1 - ang ** 2), 0)
    base = base + (rim + bowl) * (0.5 + 0.5 * rng.random())
save(np.repeat(base[..., None], 3, -1), "lua.jpg")
