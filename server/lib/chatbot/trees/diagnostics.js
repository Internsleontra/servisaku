// ─────────────────────────────────────────────────────────────────────────────
// Consumer diagnostic trees.
//
// A leaf names a catalog SLUG, never a service name. The caller resolves the
// slug against a live catalog row; an unknown or unpublished slug degrades to a
// generic recommendation. That is what makes "never hallucinate services" a
// structural property rather than a prompt instruction.
//
// `confidence` on a leaf is about the DIAGNOSIS, not the model: `high` means the
// symptom pattern is characteristic, `low` means we are pointing at the right
// trade but the professional will need to look. It changes the wording, and a
// `low` leaf never states a firm price.
// ─────────────────────────────────────────────────────────────────────────────

// Shared answer labels. Written once — repeating "yes/no/not sure" in four
// languages across ~60 nodes is how translations drift apart.
const YES = { en: 'Yes', ms: 'Ya' };
const NO = { en: 'No', ms: 'Tidak' };
const UNSURE = { en: 'Not sure', ms: 'Tidak pasti' };

const yesNo = (onYes, onNo, onUnknown = onNo) => ({
  yes: { ...onYes, label: YES },
  no: { ...onNo, label: NO },
  unknown: { ...onUnknown, label: UNSURE },
});

export const DIAGNOSTIC_TREES = [
  // ── Air conditioning ──────────────────────────────────────────────────────
  {
    id: 'ac_not_cooling',
    audience: 'consumer',
    category: 'aircon',
    root: 'noise',
    nodes: {
      noise: {
        ask: {
          en: 'Is the unit making any unusual noise?',
          ms: 'Adakah unit itu mengeluarkan bunyi luar biasa?',
        },
        answers: yesNo({ next: 'noise_kind' }, { next: 'water' }),
      },
      noise_kind: {
        ask: {
          en: 'What does it sound like — rattling, grinding, or hissing?',
          ms: 'Bunyi macam mana — bergegar, mengisar, atau mendesis?',
        },
        answers: {
          rattling: { next: 'water', label: { en: 'Rattling', ms: 'Bergegar' } },
          grinding: { leaf: 'ac_compressor', label: { en: 'Grinding', ms: 'Mengisar' } },
          hissing: { leaf: 'ac_gas_leak', label: { en: 'Hissing', ms: 'Mendesis' } },
          unknown: { next: 'water' },
        },
      },
      water: {
        ask: {
          en: 'Is water dripping or leaking from the indoor unit?',
          ms: 'Adakah air menitis atau bocor dari unit dalam?',
        },
        answers: yesNo({ leaf: 'ac_drainage' }, { next: 'fan' }),
      },
      fan: {
        ask: {
          en: 'Is the fan still blowing air, even if it is not cold?',
          ms: 'Adakah kipas masih meniup angin, walaupun tidak sejuk?',
        },
        answers: yesNo({ next: 'onset' }, { leaf: 'ac_electrical' }),
      },
      onset: {
        ask: {
          en: 'Did it stop cooling suddenly, or get gradually worse?',
          ms: 'Ia berhenti sejuk secara tiba-tiba, atau makin teruk perlahan-lahan?',
        },
        answers: {
          sudden: { leaf: 'ac_gas_leak', label: { en: 'Suddenly', ms: 'Tiba-tiba' } },
          gradual: { leaf: 'ac_service', label: { en: 'Gradually', ms: 'Perlahan-lahan' } },
          unknown: { leaf: 'ac_service' },
        },
      },
    },
    leaves: {
      ac_service: { serviceSlug: 'aircon-servicing', confidence: 'high', note: 'dirty_coils' },
      ac_gas_leak: { serviceSlug: 'aircon-gas-refill', confidence: 'high', note: 'refrigerant' },
      ac_drainage: { serviceSlug: 'aircon-servicing', confidence: 'high', note: 'blocked_drain' },
      ac_compressor: { serviceSlug: 'aircon-repair', confidence: 'medium', note: 'compressor_or_motor' },
      ac_electrical: { serviceSlug: 'aircon-repair', confidence: 'low', note: 'no_power_to_fan' },
    },
  },

  {
    id: 'ac_leaking',
    audience: 'consumer',
    category: 'aircon',
    root: 'where',
    nodes: {
      where: {
        ask: {
          en: 'Where is the water coming from — the indoor unit, or the pipe outside?',
          ms: 'Air datang dari mana — unit dalam, atau paip di luar?',
        },
        answers: {
          indoor: { next: 'volume', label: { en: 'Indoor unit', ms: 'Unit dalam' } },
          outdoor: { leaf: 'ac_normal', label: { en: 'Outside pipe', ms: 'Paip luar' } },
          unknown: { next: 'volume' },
        },
      },
      volume: {
        ask: {
          en: 'Is it a slow drip, or running water?',
          ms: 'Menitis perlahan, atau air mengalir?',
        },
        answers: {
          drip: { leaf: 'ac_drainage', label: { en: 'Slow drip', ms: 'Menitis' } },
          running: { leaf: 'ac_drainage_urgent', label: { en: 'Running', ms: 'Mengalir' } },
          unknown: { leaf: 'ac_drainage' },
        },
      },
    },
    leaves: {
      ac_drainage: { serviceSlug: 'aircon-servicing', confidence: 'high', note: 'blocked_drain' },
      ac_drainage_urgent: { serviceSlug: 'aircon-servicing', confidence: 'high', note: 'blocked_drain', urgent: true },
      ac_normal: { serviceSlug: null, confidence: 'high', note: 'condensation_is_normal' },
    },
  },

  {
    id: 'ac_noise',
    audience: 'consumer',
    category: 'aircon',
    root: 'kind',
    nodes: {
      kind: {
        ask: {
          en: 'What kind of noise — rattling, grinding, hissing, or water gurgling?',
          ms: 'Bunyi jenis apa — bergegar, mengisar, mendesis, atau air berbunyi?',
        },
        answers: {
          rattling: { leaf: 'ac_loose', label: { en: 'Rattling', ms: 'Bergegar' } },
          grinding: { leaf: 'ac_motor', label: { en: 'Grinding', ms: 'Mengisar' } },
          hissing: { leaf: 'ac_gas', label: { en: 'Hissing', ms: 'Mendesis' } },
          water: { leaf: 'ac_drain', label: { en: 'Water gurgling', ms: 'Air berbunyi' } },
          unknown: { leaf: 'ac_general' },
        },
      },
    },
    leaves: {
      ac_loose: { serviceSlug: 'aircon-servicing', confidence: 'medium', note: 'loose_panel_or_debris' },
      ac_motor: { serviceSlug: 'aircon-repair', confidence: 'medium', note: 'fan_or_compressor' },
      ac_gas: { serviceSlug: 'aircon-gas-refill', confidence: 'medium', note: 'possible_leak' },
      ac_drain: { serviceSlug: 'aircon-servicing', confidence: 'high', note: 'drain_line' },
      ac_general: { serviceSlug: 'aircon-servicing', confidence: 'low' },
    },
  },

  // ── Plumbing ──────────────────────────────────────────────────────────────
  {
    id: 'plumbing_leak',
    audience: 'consumer',
    category: 'plumbing',
    root: 'severity',
    nodes: {
      severity: {
        ask: {
          en: 'Is water flowing badly enough that you need to shut off the mains?',
          ms: 'Adakah air mengalir teruk sehingga anda perlu tutup injap utama?',
        },
        answers: yesNo({ leaf: 'plumb_emergency' }, { next: 'when' }),
      },
      when: {
        ask: {
          en: 'Does it leak all the time, or only when you use the tap?',
          ms: 'Ia bocor sepanjang masa, atau hanya bila guna paip?',
        },
        answers: {
          always: { leaf: 'plumb_supply', label: { en: 'All the time', ms: 'Sepanjang masa' } },
          in_use: { next: 'where', label: { en: 'When I use it', ms: 'Bila guna' } },
          unknown: { next: 'where' },
        },
      },
      where: {
        ask: {
          en: 'Where is it — under a sink, at the toilet, or in a wall or ceiling?',
          ms: 'Di mana — bawah sinki, tandas, atau dalam dinding atau siling?',
        },
        answers: {
          sink: { leaf: 'plumb_trap', label: { en: 'Under a sink', ms: 'Bawah sinki' } },
          toilet: { leaf: 'plumb_toilet', label: { en: 'Toilet', ms: 'Tandas' } },
          concealed: { leaf: 'plumb_concealed', label: { en: 'Wall or ceiling', ms: 'Dinding/siling' } },
          unknown: { leaf: 'plumb_general' },
        },
      },
    },
    leaves: {
      plumb_emergency: { serviceSlug: 'plumbing-emergency', confidence: 'high', urgent: true },
      plumb_supply: { serviceSlug: 'plumbing-repair', confidence: 'high', note: 'supply_line' },
      plumb_trap: { serviceSlug: 'plumbing-repair', confidence: 'high', note: 'trap_or_connector' },
      plumb_toilet: { serviceSlug: 'plumbing-repair', confidence: 'high', note: 'cistern_or_seal' },
      plumb_concealed: { serviceSlug: 'plumbing-repair', confidence: 'medium', note: 'concealed_needs_tracing' },
      plumb_general: { serviceSlug: 'plumbing-repair', confidence: 'low' },
    },
  },

  {
    id: 'plumbing_blockage',
    audience: 'consumer',
    category: 'plumbing',
    root: 'what',
    nodes: {
      what: {
        ask: {
          en: 'What is blocked — a sink, the toilet, a floor drain, or several at once?',
          ms: 'Apa yang tersumbat — sinki, tandas, longkang lantai, atau beberapa serentak?',
        },
        answers: {
          sink: { next: 'drains_slowly', label: { en: 'Sink', ms: 'Sinki' } },
          toilet: { leaf: 'block_toilet', label: { en: 'Toilet', ms: 'Tandas' } },
          floor: { next: 'drains_slowly', label: { en: 'Floor drain', ms: 'Longkang lantai' } },
          multiple: { leaf: 'block_main', label: { en: 'Several', ms: 'Beberapa' } },
          unknown: { next: 'drains_slowly' },
        },
      },
      drains_slowly: {
        ask: {
          en: 'Is it draining slowly, or not at all?',
          ms: 'Ia mengalir perlahan, atau langsung tidak?',
        },
        answers: {
          slow: { leaf: 'block_partial', label: { en: 'Slowly', ms: 'Perlahan' } },
          none: { leaf: 'block_full', label: { en: 'Not at all', ms: 'Langsung tidak' } },
          unknown: { leaf: 'block_partial' },
        },
      },
    },
    leaves: {
      block_partial: { serviceSlug: 'plumbing-repair', confidence: 'high', note: 'partial_blockage' },
      block_full: { serviceSlug: 'plumbing-repair', confidence: 'high', note: 'full_blockage' },
      block_toilet: { serviceSlug: 'plumbing-repair', confidence: 'high', note: 'toilet_blockage' },
      block_main: { serviceSlug: 'plumbing-repair', confidence: 'high', note: 'main_line_suspected', urgent: true },
    },
  },

  {
    id: 'no_hot_water',
    audience: 'consumer',
    category: 'plumbing',
    root: 'scope',
    nodes: {
      scope: {
        ask: {
          en: 'Is it every tap, or only one?',
          ms: 'Semua paip, atau satu sahaja?',
        },
        answers: {
          all: { next: 'power', label: { en: 'Every tap', ms: 'Semua paip' } },
          one: { leaf: 'water_single', label: { en: 'Only one', ms: 'Satu sahaja' } },
          unknown: { next: 'power' },
        },
      },
      power: {
        ask: {
          en: 'Does the water heater have power — any light or display on it?',
          ms: 'Adakah pemanas air ada kuasa — ada lampu atau paparan?',
        },
        answers: yesNo({ leaf: 'water_element' }, { leaf: 'water_power' }),
      },
    },
    leaves: {
      water_single: { serviceSlug: 'plumbing-repair', confidence: 'medium', note: 'single_outlet' },
      water_element: { serviceSlug: 'water-heater-repair', confidence: 'high', note: 'element_or_thermostat' },
      water_power: { serviceSlug: 'electrical-repair', confidence: 'medium', note: 'no_power_to_heater' },
    },
  },

  // ── Electrical ────────────────────────────────────────────────────────────
  {
    id: 'electrical_fault',
    audience: 'consumer',
    category: 'electrical',
    root: 'danger',
    nodes: {
      danger: {
        ask: {
          en: 'Is there any burning smell, smoke, or visible sparking?',
          ms: 'Ada bau hangit, asap, atau percikan api?',
        },
        answers: yesNo({ leaf: 'elec_emergency' }, { next: 'scope' }),
      },
      scope: {
        ask: {
          en: 'Is it one socket or light, one room, or the whole house?',
          ms: 'Satu soket atau lampu, satu bilik, atau seluruh rumah?',
        },
        answers: {
          single: { leaf: 'elec_point', label: { en: 'One point', ms: 'Satu titik' } },
          room: { leaf: 'elec_circuit', label: { en: 'One room', ms: 'Satu bilik' } },
          whole: { leaf: 'elec_main', label: { en: 'Whole house', ms: 'Seluruh rumah' } },
          unknown: { leaf: 'elec_point' },
        },
      },
    },
    leaves: {
      elec_emergency: { serviceSlug: 'electrical-emergency', confidence: 'high', urgent: true, safety: true },
      elec_point: { serviceSlug: 'electrical-repair', confidence: 'high', note: 'single_point' },
      elec_circuit: { serviceSlug: 'electrical-repair', confidence: 'high', note: 'circuit_level' },
      elec_main: { serviceSlug: 'electrical-repair', confidence: 'medium', note: 'main_or_supply' },
    },
  },

  {
    id: 'power_trip',
    audience: 'consumer',
    category: 'electrical',
    root: 'repeats',
    nodes: {
      repeats: {
        ask: {
          en: 'Does it trip again straight after you reset it?',
          ms: 'Ia trip semula sebaik sahaja anda reset?',
        },
        answers: yesNo({ next: 'appliance' }, { leaf: 'trip_intermittent' }),
      },
      appliance: {
        ask: {
          en: 'Does it stop tripping if you unplug everything on that circuit?',
          ms: 'Ia berhenti trip jika anda cabut semua perkakas pada litar itu?',
        },
        answers: yesNo({ leaf: 'trip_appliance' }, { leaf: 'trip_wiring' }),
      },
    },
    leaves: {
      trip_intermittent: { serviceSlug: 'electrical-repair', confidence: 'medium', note: 'intermittent' },
      trip_appliance: { serviceSlug: 'appliance-repair', confidence: 'high', note: 'faulty_appliance' },
      trip_wiring: { serviceSlug: 'electrical-repair', confidence: 'high', note: 'circuit_fault', urgent: true },
    },
  },

  // ── Pest ──────────────────────────────────────────────────────────────────
  {
    id: 'pest_identify',
    audience: 'consumer',
    category: 'pest',
    root: 'what',
    nodes: {
      what: {
        ask: {
          en: 'What are you seeing?',
          ms: 'Apa yang anda nampak?',
        },
        answers: {
          cockroach: { next: 'extent', label: { en: 'Cockroaches', ms: 'Lipas' } },
          ant: { next: 'extent', label: { en: 'Ants', ms: 'Semut' } },
          termite: { leaf: 'pest_termite', label: { en: 'Termites / mud tunnels', ms: 'Anai-anai' } },
          rodent: { leaf: 'pest_rodent', label: { en: 'Rats or mice', ms: 'Tikus' } },
          bedbug: { leaf: 'pest_bedbug', label: { en: 'Bedbugs', ms: 'Pepijat' } },
          unknown: { leaf: 'pest_inspection' },
        },
      },
      extent: {
        ask: {
          en: 'One room, or throughout the house?',
          ms: 'Satu bilik, atau seluruh rumah?',
        },
        answers: {
          one: { leaf: 'pest_targeted', label: { en: 'One room', ms: 'Satu bilik' } },
          many: { leaf: 'pest_general', label: { en: 'Throughout', ms: 'Seluruh rumah' } },
          unknown: { leaf: 'pest_general' },
        },
      },
    },
    leaves: {
      pest_targeted: { serviceSlug: 'pest-control', confidence: 'high', note: 'targeted_treatment' },
      pest_general: { serviceSlug: 'pest-control', confidence: 'high', note: 'general_treatment' },
      pest_termite: { serviceSlug: 'termite-treatment', confidence: 'high', note: 'inspection_first' },
      pest_rodent: { serviceSlug: 'pest-control', confidence: 'high', note: 'rodent_programme' },
      pest_bedbug: { serviceSlug: 'pest-control', confidence: 'high', note: 'bedbug_heat_or_chemical' },
      pest_inspection: { serviceSlug: 'pest-control', confidence: 'low', note: 'inspection_first' },
    },
  },

  // ── Cleaning ──────────────────────────────────────────────────────────────
  {
    id: 'cleaning_scope',
    audience: 'consumer',
    category: 'cleaning',
    root: 'occasion',
    nodes: {
      occasion: {
        ask: {
          en: 'What is the cleaning for?',
          ms: 'Pembersihan untuk apa?',
        },
        answers: {
          routine: { next: 'size', label: { en: 'Regular upkeep', ms: 'Penyelenggaraan biasa' } },
          deep: { next: 'size', label: { en: 'A thorough deep clean', ms: 'Pembersihan mendalam' } },
          movein: { leaf: 'clean_movein', label: { en: 'Moving in or out', ms: 'Pindah masuk/keluar' } },
          renovation: { leaf: 'clean_postreno', label: { en: 'After renovation', ms: 'Selepas renovasi' } },
          unknown: { next: 'size' },
        },
      },
      size: {
        ask: {
          en: 'How many bedrooms?',
          ms: 'Berapa bilik tidur?',
        },
        answers: {
          small: { leaf: 'clean_small', label: { en: '1–2', ms: '1–2' } },
          medium: { leaf: 'clean_medium', label: { en: '3', ms: '3' } },
          large: { leaf: 'clean_large', label: { en: '4 or more', ms: '4 atau lebih' } },
          unknown: { leaf: 'clean_medium' },
        },
      },
    },
    leaves: {
      clean_small: { serviceSlug: 'home-cleaning', confidence: 'high', note: 'size_small' },
      clean_medium: { serviceSlug: 'home-cleaning', confidence: 'high', note: 'size_medium' },
      clean_large: { serviceSlug: 'home-cleaning', confidence: 'high', note: 'size_large' },
      clean_movein: { serviceSlug: 'deep-cleaning', confidence: 'high', note: 'movein_moveout' },
      clean_postreno: { serviceSlug: 'post-renovation-cleaning', confidence: 'high' },
    },
  },

  // ── Appliance, structural, assembly, grooming ─────────────────────────────
  {
    id: 'appliance_fault',
    audience: 'consumer',
    category: 'appliance',
    root: 'which',
    nodes: {
      which: {
        ask: {
          en: 'Which appliance?',
          ms: 'Perkakas yang mana?',
        },
        answers: {
          washer: { next: 'power', label: { en: 'Washing machine', ms: 'Mesin basuh' } },
          fridge: { next: 'power', label: { en: 'Fridge', ms: 'Peti sejuk' } },
          oven: { next: 'power', label: { en: 'Oven or hob', ms: 'Ketuhar' } },
          other: { next: 'power', label: { en: 'Something else', ms: 'Lain-lain' } },
          unknown: { next: 'power' },
        },
      },
      power: {
        ask: {
          en: 'Does it power on at all?',
          ms: 'Adakah ia boleh dihidupkan?',
        },
        answers: yesNo({ leaf: 'appl_partial' }, { leaf: 'appl_dead' }),
      },
    },
    leaves: {
      appl_partial: { serviceSlug: 'appliance-repair', confidence: 'medium', note: 'runs_but_faulty' },
      appl_dead: { serviceSlug: 'appliance-repair', confidence: 'medium', note: 'no_power' },
    },
  },

  {
    id: 'wall_damage',
    audience: 'consumer',
    category: 'handyman',
    root: 'kind',
    nodes: {
      kind: {
        ask: {
          en: 'Is it a crack, a damp patch, peeling paint, or mould?',
          ms: 'Ia retak, tompok lembap, cat mengelupas, atau kulat?',
        },
        answers: {
          crack: { next: 'width', label: { en: 'A crack', ms: 'Retak' } },
          damp: { leaf: 'wall_damp', label: { en: 'Damp patch', ms: 'Tompok lembap' } },
          paint: { leaf: 'wall_paint', label: { en: 'Peeling paint', ms: 'Cat mengelupas' } },
          mould: { leaf: 'wall_mould', label: { en: 'Mould', ms: 'Kulat' } },
          unknown: { leaf: 'wall_cosmetic' },
        },
      },
      width: {
        ask: {
          en: 'Is it hairline, or wider than a 20-sen coin?',
          ms: 'Halus, atau lebih lebar daripada syiling 20 sen?',
        },
        answers: {
          hairline: { leaf: 'wall_cosmetic', label: { en: 'Hairline', ms: 'Halus' } },
          wide: { leaf: 'wall_structural', label: { en: 'Wider', ms: 'Lebih lebar' } },
          unknown: { leaf: 'wall_cosmetic' },
        },
      },
    },
    leaves: {
      wall_cosmetic: { serviceSlug: 'handyman', confidence: 'high', note: 'cosmetic_patch_paint' },
      wall_structural: { serviceSlug: null, confidence: 'medium', note: 'refer_structural_engineer' },
      wall_damp: { serviceSlug: 'waterproofing', confidence: 'medium', note: 'trace_source_first' },
      wall_paint: { serviceSlug: 'painting', confidence: 'high' },
      wall_mould: { serviceSlug: 'deep-cleaning', confidence: 'medium', note: 'mould_limited_scope' },
    },
  },

  {
    id: 'furniture_assembly',
    audience: 'consumer',
    category: 'handyman',
    root: 'count',
    nodes: {
      count: {
        ask: {
          en: 'How many items need assembling?',
          ms: 'Berapa banyak barang perlu dipasang?',
        },
        answers: {
          one: { next: 'kind', label: { en: '1', ms: '1' } },
          few: { next: 'kind', label: { en: '2–4', ms: '2–4' } },
          many: { leaf: 'assembly_bulk', label: { en: '5 or more', ms: '5 atau lebih' } },
          unknown: { next: 'kind' },
        },
      },
      kind: {
        ask: {
          en: 'Does anything need fixing to a wall?',
          ms: 'Ada apa-apa perlu dipasang pada dinding?',
        },
        answers: yesNo({ leaf: 'assembly_mount' }, { leaf: 'assembly_standard' }),
      },
    },
    leaves: {
      assembly_standard: { serviceSlug: 'furniture-assembly', confidence: 'high' },
      assembly_mount: { serviceSlug: 'furniture-assembly', confidence: 'high', note: 'wall_mounting' },
      assembly_bulk: { serviceSlug: 'furniture-assembly', confidence: 'medium', note: 'bulk_quote' },
    },
  },

  {
    id: 'grooming_scope',
    audience: 'consumer',
    category: 'beauty',
    root: 'who',
    nodes: {
      who: {
        ask: {
          en: 'Which service are you after?',
          ms: 'Perkhidmatan apa yang anda cari?',
        },
        answers: {
          hair: { leaf: 'groom_hair', label: { en: 'Hair', ms: 'Rambut' } },
          nails: { leaf: 'groom_nails', label: { en: 'Nails', ms: 'Kuku' } },
          facial: { leaf: 'groom_facial', label: { en: 'Facial', ms: 'Rawatan muka' } },
          massage: { leaf: 'groom_massage', label: { en: 'Massage', ms: 'Urutan' } },
          unknown: { leaf: 'groom_browse' },
        },
      },
    },
    leaves: {
      groom_hair: { serviceSlug: 'hair-services', confidence: 'high' },
      groom_nails: { serviceSlug: 'nail-services', confidence: 'high' },
      groom_facial: { serviceSlug: 'facial-treatment', confidence: 'high' },
      groom_massage: { serviceSlug: 'massage', confidence: 'high' },
      // Guessing a beauty service from "not sure" would be worse than showing
      // the category, so this leaf deliberately recommends nothing.
      groom_browse: { serviceSlug: null, confidence: 'low', note: 'browse_beauty_category' },
    },
  },
];

export const TREES_BY_ID = Object.fromEntries(DIAGNOSTIC_TREES.map((tr) => [tr.id, tr]));
