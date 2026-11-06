# Andas – Wim Hof-andning

En webbapp för guidad Wim Hof-andning: en orb som växer och krymper i takt med andningen, genererad bakgrundsmusik, inställbart antal andetag, tempo och rundor, samt loggning av hur länge du håller andan.

## Kom igång

```bash
npm install
npm run dev        # öppna http://localhost:5173
```

`npm run dev` lyssnar även på nätverket, så du kan öppna appen på mobilen via datorns IP-adress (t.ex. `http://192.168.1.10:5173`).

Övriga kommandon:

```bash
npm run build      # typkontroll + produktionsbygge till dist/
npm run preview    # serva produktionsbygget lokalt
```

## Så fungerar ett pass

1. **Gör dig redo** – 3 sekunders nedräkning.
2. **Andning** – X djupa andetag i valt tempo. Orben växer vid inandning och krymper vid utandning.
3. **Andhållning** – efter sista utandningen håller du andan. En timer räknar uppåt. Tryck på orben, på *Andas in* eller mellanslag när du behöver andas.
4. **Återhämtning** – andas in djupt och håll i X sekunder (standard 15).
5. Nästa runda börjar. Efter sista rundan visas en sammanfattning och passet sparas i historiken.

Tangentbord: `Mellanslag` avslutar andhållningen, `Esc` avslutar passet (avklarade rundor sparas).

## Inställningar

| Inställning           | Intervall          | Standard |
| --------------------- | ------------------ | -------- |
| Andetag per runda     | 10–60              | 30       |
| Tempo (s per andetag) | 1,5–6,0            | 3,0      |
| Rundor                | 1–8                | 3        |
| Återhämtningsandetag  | 5–30 s             | 15 s     |
| Bakgrundsljud         | Ambient / Hav / Inget | Ambient |
| Andningsljud          | på/av              | på       |
| Volym                 | 0–100 %            | 70 %     |

Inställningarna sparas i webbläsaren.

## Teknik

- **Vite + React + TypeScript**
- **Animation**: 2D-canvas (`src/components/BreathOrb.tsx`) – glödande orb, krusningsringar, partiklar som dras in vid inandning och färger som skiftar per fas (blå = andning, lila = andhållning, varm = återhämtning). Three.js behövdes inte.
- **Ljud**: allt genereras i realtid med Web Audio API (`src/audio/AudioEngine.ts`) – inga ljudfiler och inga licensfrågor. Ambient-läget är en svävande bordun med glesa klockspelstoner, Hav-läget är rullande vågor av brus. Andningsljudet följer animationen och klangskålar markerar fasbyten.
- **Logik**: `src/engine/BreathEngine.ts` är en tidsstyrd tillståndsmaskin helt fri från React.
- Skärmen hålls tänd under passet (Wake Lock API där det stöds).

## Förberett för databas

All lagring av pass går via gränssnittet `SessionRepository` (`src/storage/SessionRepository.ts`), som är asynkront. Idag används `LocalStorageSessionRepository`. För att byta till en riktig databas:

1. Skapa t.ex. `src/storage/SupabaseSessionRepository.ts` som implementerar `list`, `save`, `remove` och `clear`.
2. Byt instansen i `src/storage/index.ts`.

Datamodellen (`BreathingSession` / `RoundResult` i `src/types.ts`) mappar direkt mot två tabeller:

```sql
create table sessions (
  id uuid primary key,
  user_id uuid,
  started_at timestamptz not null,
  ended_at timestamptz not null,
  breaths_per_round int not null,
  seconds_per_breath real not null,
  rounds int not null,
  recovery_hold_seconds int not null
);

create table session_rounds (
  session_id uuid references sessions(id) on delete cascade,
  round int not null,
  breaths int not null,
  retention_ms int not null,
  primary key (session_id, round)
);
```

## Säkerhet

Gör aldrig andningsövningen i eller nära vatten, när du kör bil eller står upp. Yrsel och stickningar är vanligt – lyssna på kroppen.
