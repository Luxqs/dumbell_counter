# Audit funkcionality — september 2026

> **Rozsah:** celá aplikácia, plus re‑verifikácia toho, čo tvrdí
> `AUDIT_2026-09.md`. Nešlo o čítanie kódu — každý nález nižšie je reprodukovaný
> spusteným kódom a číslo v ňom je namerané, nie odhadnuté.
>
> **Výsledok:** 15 nálezov, všetkých 15 opravených. Testy pred zásahom
> `unit` 61/61 + `e2e` 45/45, po zásahu **`unit` 66/66 + `e2e` 50/50**.
> Deväť nových testov je označených `(regression)` a **preukázateľne padá** proti
> stromu, aký bol na začiatku tejto relácie.
>
> **Neopravené** (vyžadujú rozhodnutie, nie opravu): kalibrácia, prepínač
> kamery, kontrola uhla pohľadu, offline režim. Zoznam na konci.

---

## 0. Re‑verifikácia predchádzajúceho auditu

Spustené `tools/probe-framerate.js` a `tools/probe-accuracy.js` proti aktuálnemu
kódu. Tvrdenia z `AUDIT_2026-09.md` sedia:

| Nález (09/2026) | Stav | Nameraná evidencia |
|---|---|---|
| P0‑1 snímková frekvencia | ✅ potvrdené opravené | 5/5 opakovaní pri 8, 10, 12, 15, 20, 30 fps pre všetkých 6 testovaných cvikov; predtým 1/5 pod 15 fps |
| P0‑3 útes dôveryhodnosti 0,5 | ✅ potvrdené opravené | goblet‑squat, skóre bedra 0,9 / 0,55 / 0,49 / 0,40 / 0,30 → 5/5 vo všetkých prípadoch |
| P1‑4 uzamknutie na osobu | ⚠️ opravené, ale **neúplne** | funguje v rámci série; medzi sériami sa zámok neresetoval — viď **F‑11** |
| P1‑7 časovač oddychu | ✅ potvrdené opravené | riadený termínom, dopočítava sa pri návrate na kartu; jeden okrajový prípad viď **F‑15** |
| P2 (undo ROM, pomer strán, `track.onended`) | ⚠️ opravené, ale `onended` má dieru | viď **F‑5** |

**Jedna vec, ktorú predchádzajúci audit nezachytil a je jeho vlastný vedľajší
účinok:** oprava P0‑1 zaviedla rozhodovanie „kto stojí vo východiskovej polohe"
(`core.js`, výber aktívnej strany). Práve toto rozhodovanie spôsobuje **F‑1
nižšie — dvojité počítanie**. Opravou pomalých telefónov sa rozbilo počítanie
na rýchlych, keď človek na vrchole zastaví. To je najzávažnejší nález tohto
auditu.

Drobnosť bez závažnosti, ale stojí za zaznamenanie: potrebný presah za
`peakThreshold` je dnes **+0° pri 10–15 fps, ale +3–4° pri 30 fps** — vetva
`dt < CONFIRM_MS` v `_confirm()` žiada zotrvanie 60 ms, čo je pri 30 fps práve
druhá snímka. Prah je teda na rýchlom telefóne o pár stupňov „hlbšie". Nie je to
chyba, ale je to opak toho, čo by človek čakal.

---

## P0 — chyby, ktoré menia zapísané čísla

### F‑1 · Zadržanie na vrchole počíta opakovanie DVAKRÁT ✅ OPRAVENÉ

Najzávažnejší nález. Nadpočítanie je horšie než podpočítanie: séria skončí
predčasne a do histórie sa zapíše niečo, čo sa nestalo.

**Reprodukcia** (`tests/unit.test.js`, „one-arm work… (regression)"): jednoručný
zdvih, pracovná ruka robí 3 čisté opakovania, nečinná ruka visí na 170° — čo je
u bicepsového zdvihu **presne pásmo pokoja**. Používateľ na vrchole stiahne sval
na ~1 s, ako to robí každý.

| cvik | zadržanie 0 s | 0,3 s | **1,0 s** | **2,0 s** |
|---|---|---|---|---|
| concentration-curl | 3 z 3 | 3 z 3 | **6 z 3** | **6 z 3** |
| bicep-curl | 3 z 3 | 3 z 3 | **6 z 3** | **6 z 3** |
| hammer-curl | 3 z 3 | 3 z 3 | **6 z 3** | **6 z 3** |

**Mechanizmus** (odsledovaný po snímkach): na vrchole klesne `motion` pracovnej
ruky pod `MOTION_FLOOR_DPS`. Tým sa v `update()` aktivuje vetva „nič sa nehýbe a
práve jedna ruka stojí vo východiskovej polohe" a `activeSide` sa odovzdá
**nečinnej** ruke. Tá má `restConfirmed === true` trvalo, takže natiahne západku
(`_armed = true`) v momente, keď je činka **stále hore**. Nasledujúca snímka
pohybu vráti `activeSide` pracovnej ruke, ktorá je stále za `peakThreshold` s
`peakConfirmed === true` → započíta sa druhé opakovanie z vrcholu, ktorý ruka
nikdy neopustila.

Trasa zmien strany počas 1 s zadržania (pred opravou):
`f10:right/reps0` → `f62:left/reps1/armed=true` → `f70:right/reps2` — západka sa
natiahla na snímke 62 pri ruke, ktorá necvičí.

**Oprava:** cyklus smie zavrieť len tá strana, ktorá opakovanie započítala
(`_repSide`). Ak táto strana nie je viditeľná, padá sa späť na aktívnu stranu,
takže výpadok kĺbu sériu nezamrazí (kryté samostatným testom bez značky
`regression` — to je chyba, ktorú som pri oprave takmer urobil, nie tá, ktorá
bola v kóde).

**Koho sa to týkalo:** `concentration-curl` a `dumbbell-row` vždy; každý
obojručný cvik vtedy, keď model jednu ruku stratí alebo ju umiestni do pásma
pokoja. Teda presne tie situácie, na ktoré je appka predávaná.

### F‑2 · Odchod z tréningu zahodil všetko, čo bolo odcvičené ✅ OPRAVENÉ

**Reprodukcia:** načítaj šablónu „Spodná časť tela" (3 cviky), dokonči prvý cvik,
ťukni **← Späť** a potvrď. Nameraný stav pred opravou: `planResults` obsahuje
1 cvik, `planIndex = 1`, **`history.list().length === 0`**. Štyri dokončené cviky
z päťcvikového tréningu skončili v histórii ako nič.

Otázka sa navyše na nič nepýtala — znela „Ukončiť tréning a vrátiť sa na
nastavenia?" a o strate dát nepovedala ani slovo.

**Oprava:** `_saveAbandonedSession()` zapíše, čo bolo odcvičené, v rovnakom tvare
ako dokončený tréning (`planName` dostane príponu „(nedokončený)"), takže história
aj oba exportéry s ním zaobchádzajú ako s hociktorým iným. Potvrdzovacia otázka
teraz konkrétne hovorí, koľko sérií sa uloží. Zapisujú sa len **dokončené** série;
rozcvičená séria s jedným ťuknutím sa neuloží a otázka to nesľubuje.

### F‑3 · Dva profily môžu ticho zdieľať jeden dataset ✅ OPRAVENÉ

`namespace()` bol `name.replace(/[^a-zA-Z0-9]/g, '_')`. Namerané:

| profil A | profil B | prefix A | prefix B | zhoda |
|---|---|---|---|---|
| `Jano K` | `Jano-K` | `u_Jano_K_` | `u_Jano_K_` | **áno** |
| `Jano K` | `Jano.K` | `u_Jano_K_` | `u_Jano_K_` | **áno** |
| `Ivča` | `Ivša` | `u_Iv_a_` | `u_Iv_a_` | **áno** |

Zhoda prefixu znamená spoločnú históriu, spoločné plány, spoločné predvoľby aj
spoločnú pamäť váh — a v UI nič, čo by to naznačilo. Pri slovenských menách s
diakritikou to nie je exotika: každá dvojica mien, ktorá sa líši len v mäkčeni
alebo dĺžni, spadne na jeden prefix.

**Oprava:** prefix je injektívny. Existujúce inštalácie sa nesmú rozbiť, takže si
**prvý** profil, ktorý si daný prefix nárokuje, ponechá starý tvar a až kolidujúci
neskorší profil dostane príponu z hashu skutočného mena. Nároky sú zapísané v
`dc_profile_ns_v1`, takže odpoveď je stabilná naprieč reláciami.

> Pozor pri nasadení: ak už dnes dva profily zdieľajú prefix, ich dáta sú
> zmiešané už teraz. Po tejto oprave si ten, ktorý sa spýta prvý, ponechá
> zmiešaný dataset a druhý začne s prázdnym. Nič sa nemaže, ale to zmiešanie sa
> spätne rozpliesť nedá.

---

## P1 — chyby, ktoré kazia spoľahlivosť alebo klamú používateľa

### F‑4 · Pauza a pokračovanie zdvojili detekčnú slučku ✅ OPRAVENÉ

**Reprodukcia** (`tests/e2e.test.js`, regression): počas prebiehajúcej inferencie
ťukni Pauza a hneď Pokračovať. Namerané: pred opravou **2 čakajúce rAF reťazce**,
ktoré tam ostali po zvyšok série; po oprave **1**.

Pokračovanie naplánuje snímku a keď sa dokončí `detect()`, ktorý bežal počas
pauzy, jeho `_tick` naplánuje ďalšiu a **prepíše `this.animationId`** — na prvý
reťazec sa `cancelAnimationFrame` už nikdy nedostane. Každá ďalšia dvojica
pauza+pokračovanie pridá jeden. Na telefóne, ktorý beží na 8–15 fps, sa to platí
priamo z rozpočtu snímok, od ktorého závisí počítanie.

**Oprava:** každá naplánovaná snímka nesie generáciu slučky; `_stopLoop()` a
`_startLoop()` ju posunú, takže osirelý reťazec sa sám ukončí.

### F‑5 · Odpojenie kamery počas oddychu nikto nepočul ✅ OPRAVENÉ

`track.onended` mal `if (!this.isRunning) return;` — a počas oddychu je
`isRunning === false`. Telefonát počas 90‑sekundovej pauzy teda prešiel ticho a
ďalšia séria naštartovala slučku proti mŕtvemu streamu, kde jediná spätná väzba
bola toast po piatich neúspešných snímkach. Model pritom dostáva poslednú
zachytenú snímku, čo vyzerá presne ako človek stojaci úplne nehybne.

**Oprava:** handler hlási odpojenie aj počas oddychu a `_endRest()` pred štartom
série overí, či stream ešte má živú stopu (`_cameraAlive()`).

### F‑6 · Pípanie mohlo byť celú reláciu ticho (iOS) ✅ OPRAVENÉ

`AudioContext` sa konštruoval až pri **prvom pípnutí opakovania**, čo nie je
používateľské gesto. Na iOS taký kontext vznikne v stave `suspended` a `resume()`
mimo gesta nič neurobí — takže padne každé pípnutie relácie vrátane akordu „GO"
na konci oddychu. To je jediná spätná väzba, ktorú máš, keď je telefón opretý na
druhej strane miestnosti.

**Oprava:** `AudioManager.prime()` volané z ťuknutia, ktoré tréning spúšťa,
z „Pokračovať" a z „Preskočiť pauzu". Primuje sa aj pri vypnutom zvuku, aby
zapnutie zvončeka uprostred série fungovalo.

### F‑7 · Predvoľby sa nesanitizovali (plány áno) ✅ OPRAVENÉ

`WorkoutPlanManager.getSanitised()` existoval, `WorkoutManager` mal len `get()`.
Namerané: predvoľba s `exerciseId: 'no-such-exercise'` prejde do UI nedotknutá,
vyprázdni výber cviku, a **`new RepCounter('')` nezapočíta ani jedno opakovanie**
za celý tréning. Appka o tom nepovie nič.

**Oprava:** `WorkoutManager.getSanitised()` s rovnakými pravidlami ako pri
plánoch; poškodená predvoľba sa odmietne s toastom.

### F‑8 · „Dokončiť ▶" uprostred tréningu neznamenalo dokončiť ✅ OPRAVENÉ

Na poslednej sérii cviku sa tlačidlo pomenovalo „Dokončiť ▶" bez ohľadu na to,
že v pláne nasledovali ďalšie štyri cviky. Je to jediný popis, ktorému
používateľ musí vedieť veriť skôr, než ťukne.

**Oprava:** „Ďalšia séria ▶" → „**Ďalší cvik ▶**" → „Dokončiť ▶", podľa toho, čo
tlačidlo naozaj urobí.

### F‑9 · „Celkový postup" počítal len práve prebiehajúci cvik ✅ OPRAVENÉ

`((currentSet-1) * targetReps + reps) / (targetSets * targetReps)` nepozná plán.
V šesťcvikovom tréningu teda pruh došiel na 100 % šesťkrát a o zvyšku tréningu
nepovedal nič. Namerané po oprave: pri 3 naplánovaných sériách a jednej hotovej
ukazuje **33 %**, nie 50 %.

### F‑10 · Z obrazovky oddychu sa nedalo odísť ✅ OPRAVENÉ

Počas trojminútovej pauzy (šablóna 5×5) boli jediné cesty von dokončiť tréning
alebo zavrieť kartu. Pridaný odkaz **„Ukončiť tréning a uložiť"**, ktorý ide cez
tú istú cestu ako F‑2, takže odcvičené série sa uložia.

### F‑11 · Medzi sériami sa neresetoval zámok na osobu ani meranie fps ✅ OPRAVENÉ

`_loadNextPlanExercise()` volá `detector.resetSubject()`, ale vetva „ďalšia
séria" v `_endRest()` nie. Pritom oddych je presne ten moment, keď človek odíde
a vráti sa — ťažisko trupu sa posunie dosť na to, aby uzamknutie prvú a pol
sekundy novej série zahadzovalo. Rovnako sa prenášali časy snímok namerané cez
obrazovku oddychu, kde slučka nebežala, takže odznak signálu otváral novú sériu
s fps, ktoré kamera nikdy nevyrobila. Oboje sa teraz resetuje na oboch cestách
aj pri štarte tréningu.

---

## P2 — menšie, ale reálne

### F‑12 · Dva tréningy uložené v tej istej milisekunde mali rovnaké `id` ✅
`id: Date.now()`. Namerané: `history.delete(id)` zmazal **oba** záznamy. Prakticky
nedosiahnuteľné rukou, ale je to tichá strata dát a oprava stojí jeden riadok.

### F‑13 · RPE prekrytie hýbalo stavovým automatom aj mimo tréningu ✅
`Escape` nad prekrytím, ktoré ostalo aktívne po odchode z tréningu, spustil
`_proceedAfterSet()` nad zvyškovým stavom a naštartoval oddych pre tréning, ktorý
už nebeží. Odhalil to nový test; v produkcii je to ťažko dosiahnuteľné, ale
strážiť to stojí jednu podmienku (`_setCompleting`).

### F‑14 · Strava OAuth nemal parameter `state` ✅
Stránka vymenila **akýkoľvek** `?code=` za tokeny. Odkaz pripravený niekým iným
teda vedel spárovať tento prehliadač s cudzím účtom a všetky ďalšie nahrávania
by končili v cudzom feede. Doplnený `state` s overením zo `sessionStorage`.
(Relevantné až po vyplnení `STRAVA_CONFIG`, ktoré je zatiaľ prázdne.)

### F‑15 · Nulový oddych nechával za sebou neplatné `restTimer` id ✅
`clearInterval()` id nevynuluje, a `visibilitychange` testuje práve `restTimer`
predtým, než prepočíta odpočet — s termínom z **predchádzajúceho** oddychu. Latentné,
opravené jedným riadkom.

---

## Čo zostávalo otvorené po časti 1

Zoznam desiatich bodov, ktoré audit našiel, ale neopravil. Čo sa s nimi stalo, je
v časti 2 nižšie: **deväť z desiatich je zapracovaných**, jeden zostáva ako
rozhodnutie pre teba.

---

# Časť 2 — zapracovanie otvorených bodov

> **Stav:** `unit` **79/79**, `e2e` **56/56** (po časti 1 to bolo 66 + 50).
> Devätnásť nových testov, z toho **13 označených `(regression)`** —
> všetkých 13 preukázateľne padá proti stromu spred tejto relácie a všetkých
> 106 pôvodných testov v tej istej kópii prechádza.

## N‑1 · Kalibrácia na človeka — najväčší otvorený bod ✅ ZAPRACOVANÉ

Pásma v `config.js` boli jeden pevný odhad pre všetkých. Opakovanie, ktoré sa
zastaví presne na `peakThreshold`, sa počíta **0×** (prah treba prekročiť *a*
chvíľu na ňom zotrvať), takže kto nezamkne kĺb do predpokladaného uhla,
nedostal za celú sériu nič — a appka mu celý čas hovorila „choď vyššie".

**Nameraný dôkaz** (`tests/unit.test.js`, regression): cvičenec, ktorý na
bench‑presse končí na 140° namiesto predpokladaných 155°:

| | bez kalibrácie | s kalibráciou |
|---|---|---|
| započítané opakovania | **0 z 5** | **5 z 5** |

**Ako to funguje:**
- `CalibrationRun` sleduje surový uhol oboch strán nezávisle; vyhrá tá s
  väčším rozsahom, takže jednoručný cvik sa kalibruje z ruky, ktorá pracovala.
- Beh sa uzná až keď je rozsah ≥ 25° **a** nastali ≥ 3 zmeny smeru (asi dve
  poctivé opakovania). Jeden šťastný priebeh nestačí.
- `deriveCountingBand()` je čistá funkcia: `idealPeak` = tvoj skutočný vrchol,
  opakovanie sa počíta od **70 %** tvojej dráhy, západka sa natiahne keď si späť
  do **15 %** rozsahu od východiskovej polohy. Nepravdepodobná kalibrácia
  (úzky rozsah, opačný smer, nečíselná hodnota) sa **odmietne** a použije sa
  pôvodné pásmo — zlá kalibrácia nikdy nesmie byť horšia než žiadna.
- Ukladá sa per profil per cvik (`dc_<ns>calibration_v1`). **Odmietnutie sa
  ukladá tiež**, takže sa nikto nepýta každú reláciu.

**Past, do ktorej som pri tom skoro spadol** (kryté testom bez značky
`regression`, lebo to nikdy neodišlo do kódu): keby západka sedela presne na
nameraných krajných uhloch, musel by si ich trafiť na chlp pri každom
opakovaní — séria by započítala jedno a zastavila sa. Preto tých 15 %.

**Trenie:** pri prvom tréningu zo šiestich cvikov sa appka spýta šesťkrát,
jedno ťuknutie na preskočenie. Potom už nikdy. Prekalibrovať sa dá zo
setup obrazovky.

## N‑2 · Kontrola záberu pred sériou ✅ ZAPRACOVANÉ

Každý cvik v `config.js` mal `cameraHint` ako vetu pre človeka a nič to
neoverovalo. Otočený trup = systematicky skreslený uhol a appka mlčí.

Pribudlo pole `view` (`sagittal` / `frontal` / `any`) na všetkých 16 cvikoch a
`assessView()`, ktorý z pomeru **šírka ramien : výška trupu** rozlíši čelný
(≥ 0,55) a bočný (≤ 0,30) pohľad. Medzi tým je „šikmý" a vtedy appka **mlčí** —
otravovať pri nejednoznačnom meraní je horšie než nepovedať nič.

`assessFraming()` vráti jednu vetu, zoradenú podľa toho, čo naozaj zastaví
počítanie: chýbajúci kĺb **menom** („Nevidím zápästie…") → zlý uhol pohľadu →
slabé sledovanie → nízke fps. Zobrazuje sa **len pred prvým opakovaním série**
a v kalibračnom okne; keď sa človek rozhýbe, riadok patrí opakovaniu.

## N‑3 · Offline režim ✅ ZAPRACOVANÉ (čiastočne — viď N‑10)

`sw.js` + `manifest.webmanifest` + `icon.svg`. Cache‑first pre dva pripnuté
CDN skripty a pre váhy modelu (`tfhub.dev`, `storage.googleapis.com`,
`kaggle.com`), stale‑while‑revalidate pre appku samotnú. Registruje sa až na
konci `_init()` a nikdy sa naň nečaká, takže zlyhanie nemôže zdržať štart.

Test `the service worker precaches exactly the files that exist (regression)`
drží zoznam poctivý: premenovaný súbor, ktorý sa prestane cachovať, zhodí testy
namiesto toho, aby ticho rozbil offline režim až v posilňovni.

> **Vývoj:** úprava sa prejaví až pri **druhom** načítaní. Buď zvýš
> `CACHE_VERSION`, alebo odregistruj workera v DevTools → Application.

## N‑4 · Výber kamery ✅ ZAPRACOVANÉ

Prepínač prednej/zadnej kamery priamo nad obrazom, voľba sa pamätá
(`dc_camera_facing`), žiadosť o 1280×720 namiesto 640×480. Zrkadlenie je
selfie efekt — pri zadnej kamere sa **vypína na oboch vrstvách naraz**, inak
skeleton pristane na opačnej strane tela. Zlyhanie prepnutia (telefón s jednou
kamerou) sa vráti k pôvodnej a znova ju otvorí; test to overuje vyvolaním
`NotFoundError`.

`_attachStream()` zjednocuje všetko, čo sa musí stať po získaní streamu
(sledovanie `ended`, pomer strán), takže štart tréningu a prepnutie kamery
sa nemôžu rozísť.

## N‑5 · Undo nedosiahlo opakovanie, ktoré sériu ukončilo ✅ ZAPRACOVANÉ

Dosiahnutie cieľa zastaví slučku a zhodí `isRunning` skôr, než sa dá stlačiť
tlačidlo — takže práve to nadpočítané opakovanie, ktoré sériu predčasne
ukončilo, sa nedalo odobrať. Undo teraz v tom 400 ms okne zruší čakajúce
dokončenie, postaví sériu späť na nohy a povie „Séria pokračuje".

## N‑6 · História nemala detail série ✅ ZAPRACOVANÉ

Karta ukazovala priemery — a priemer skryje presne to, z čoho sa číta
progresívne preťaženie: či posledná séria vydržala. Rozklad po sériách
(opakovania, váha, RPE, čas) je v `<details>`, takže karta ostáva jednoriadková,
kým sa nespýtaš. Dáta tam boli celý čas — v `localStorage` aj v .FIT exporte —
len ich nebolo kde vidieť.

## N‑7 · TCX bez `<Track>` ✅ ZAPRACOVANÉ

`Lap` bez `Track` je podľa schémy legálny a v praxi ho slušná časť importérov
berie ako prázdny. Dva holé `Trackpoint`y (začiatok a koniec) stačia; poradie
elementov je dané schémou — `Track` ide **za** `TriggerMethod` a **pred**
`Notes`.

## N‑8 · Riadok plánu sa po presune zabalil ✅ ZAPRACOVANÉ

`_renderPlanList(openIdx)` nechá otvorený ten riadok, s ktorým si práve
pracoval, namiesto toho, aby ti pod rukami zavrel celý zoznam.

## N‑9 · Pamäť váh ignorovala 0 ✅ ZAPRACOVANÉ

`if (val > 0)` znamenalo, že „dnes bez činky" sa nedalo zapamätať a appka ti
donekonečna predvypĺňala minulomesačných 20 kg. Nula je odpoveď.

## N‑10 · Vendorovanie knižníc a SRI ⬜ ZOSTÁVA — je to tvoje rozhodnutie

Service worker rieši **dostupnosť** (posilňovňa bez signálu). Nerieši
**dodávateľský reťazec**: `index.html` stále ťahá dva skripty z
`cdn.jsdelivr.net` bez `integrity` a bez `crossorigin`, takže kompromitovaná
CDN dostane plný prístup ku kamere a k `localStorage`.

Neurobil som to a dôvod je konkrétny: zlý SRI hash appku zabije **bez viditeľnej
chyby** (SRI zlyhanie je len konzolový log), a správny hash ju zabije tiež, ak
jsdelivr niekedy premení bajty. Overiť sa to dá len stiahnutím presných bajtov,
ktoré CDN reálne servíruje. Máš dve cesty a obe sú rozhodnutie o repozitári,
nie oprava:

1. **Priložiť knižnice do repozitára** (~2–3 MB minifikovaného JS). Rieši oboje
   naraz, ale mení veľkosť repa a spôsob aktualizácie.
2. **Nechať CDN a doplniť SRI** po overení hashov na reálnej sieti.

## Čo som zámerne neurobil ani teraz

**Metrika námahy** (strata rýchlosti v rámci série). Dáta sú k dispozícii —
tempo aj rozsah každého opakovania sa merajú — ale *čo presne zobraziť* je
produktové rozhodnutie, nie oprava. Zle zvolená metrika je horšia než žiadna,
lebo ľudia podľa nej začnú riadiť tréning.

## Dve poctivé výhrady k časti 2

1. **Čísla kalibrácie (70 % / 15 % / min. 25° / 3 zmeny smeru) sú moja voľba,
   overená len syntetickými dátami.** Sedia na testoch aj na fyzikálnej úvahe,
   ale na skutočnom tele ich nikto neskúšal. Prvá vec, ktorú treba urobiť s
   telefónom v ruke.
2. **Či 1280×720 reálne zlepší presnosť kĺbov, som nezmeral.** MoveNet si vstup
   aj tak oreže; vyššie rozlíšenie stojí niečo vo video pipeline. Appka si pri
   poklese pod 12 fps prepne model, takže to nemôže tíško ublížiť — ale ani
   netvrdím, že to pomôže.

## Čo presne sa zmenilo — spolu za obe časti

| Súbor | Zmena |
|---|---|
| `js/core.js` | **Časť 1:** `_repSide` (F‑1), injektívny `namespace()` + `dc_profile_ns_v1` (F‑3), `WorkoutManager.getSanitised()` (F‑7), unikátne `id` (F‑12), `AudioManager.prime()` (F‑6). **Časť 2:** `jointAngle()` vyňatý ako zdieľaný, `CALIB_*` konštanty, `deriveCountingBand()`, `CalibrationRun`, `CalibrationStore`, `assessView()`, `assessFraming()`, `RepCounter(exerciseId, calibration)` + `this.counting` namiesto `this.exercise.counting` na šiestich miestach |
| `js/app.js` | **Časť 1:** generácia slučky, `_saveAbandonedSession()`, `_cameraAlive()`, resety pri štarte série, popis tlačidla, celkový postup naprieč plánom, stráž `_setCompleting` v RPE. **Časť 2:** kalibračný tok (`_maybeStartCalibration`, `_updateCalibrationUI`, `_finishCalibration`), `_withFramingAdvice()`, `_cameraConstraints()` / `_cameraFacing()` / `_flipCamera()` / `_attachStream()`, `_registerServiceWorker()`, undo v okne dokončenia, `_renderPlanList(openIdx)`, história po sériách, pamäť váh vrátane 0 |
| `js/config.js` | pole `view` na všetkých 16 cvikoch |
| `js/export.js` | OAuth `state` (F‑14), `<Track>` v TCX (N‑7) |
| `index.html` | odkaz na ukončenie z obrazovky oddychu, kalibračné okno, riadok stavu kalibrácie na setupe, prepínač kamery, `<link rel="manifest">` |
| `css/styles.css` | `.rest-end-link`, kalibračné okno a stavový riadok, `.btn-camera-flip`, `.camera-wrapper.rear`, tabuľka sérií v histórii |
| `sw.js`, `manifest.webmanifest`, `icon.svg` | nové — offline shell |
| `tests/unit.test.js` | 61 → **79**; export symbolov je odolný (`try` na symbol), aby sa sada dala spustiť proti staršiemu `js/` — bez toho sa regresné testy nedali overiť vôbec |
| `tests/e2e.test.js` | 45 → **56**; `skipCalib()` je null‑safe, aby nikdy nebol dôvodom pádu testu, ktorý s kalibráciou nesúvisí |

## Ako si to overiť

```sh
node tests/unit.test.js      # 79/79
node tests/e2e.test.js       # 56/56, trvá ~40 s
node tools/probe-framerate.js
node tools/probe-accuracy.js
```

Overenie regresných testov (kópia `js/` spred relácie + `git show HEAD:index.html`
+ **aktuálne** `tests/`): **unit 6 z 6 tagovaných padlo, e2e 7 z 7 padlo**, a
všetkých 106 pôvodných testov v tej istej kópii prešlo. Dva testy nesú
komentár, prečo značku `regression` **nemajú** — strážia chyby, ktoré som pri
opravovaní takmer urobil, nie také, čo boli v kóde.
