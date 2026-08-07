export type Locale = "zh" | "vi" | "en";

export interface Entity {
  tag: string;
  name: string;
  rows: { label: string; value: string }[];
}

export interface Translations {
  nav: {
    single: string;
    batch: string;
    home: string;
    quote: string;
  };
  site: {
    nav: {
      about: string;
      services: string;
      solutions: string;
      cases: string;
      network: string;
      contact: string;
      quote: string;
    };
    hero: {
      eyebrow: string;
      title: string;
      lead: string;
      primary: string;
      secondary: string;
      stats: { value: string; label: string }[];
      badge1: string;
      badge2: string;
      badge3: string;
    };
    quickQuote: {
      eyebrow: string;
      title: string;
      intro: string;
      originLabel: string;
      originPlaceholder: string;
      destLabel: string;
      destPlaceholder: string;
      weightLabel: string;
      weightPlaceholder: string;
      typeLabel: string;
      submit: string;
      calculating: string;
      resultTitle: string;
      totalLabel: string;
      distanceLabel: string;
      modelLabel: string;
      vehicleLabel: string;
      vehicleAuto: string;
      note: string;
      fullTool: string;
      error: string;
      tabQuote: string;
      tabAI: string;
      tabMap: string;
    };
    services: {
      eyebrow: string;
      title: string;
      intro: string;
      items: { title: string; body: string; points: string[] }[];
    };
    solutions: {
      eyebrow: string;
      title: string;
      intro: string;
      items: { sector: string; title: string; body: string }[];
    };
    network: {
      eyebrow: string;
      title: string;
      intro: string;
      china: { flag: string; name: string; body: string; points: string[] };
      vietnam: { flag: string; name: string; body: string; points: string[] };
      note: string;
    };
    aiAssistant: {
      eyebrow: string;
      title: string;
      intro: string;
      hint1: string;
      hint2: string;
      hint3: string;
      example: string;
      fabLabel: string;
      fabOpen: string;
      fabClose: string;
    };
    cases: {
      eyebrow: string;
      title: string;
      intro: string;
      items: {
        id: string;
        title: string;
        type: string;
        body: string;
        tags: string[];
        image: string;
        gallery: string[];
        overview: string;
        details: { label: string; value: string }[];
        services: string[];
        results: string[];
      }[];
      note: string;
      back: string;
      related: string;
      allCases: string;
    };
    company: {
      eyebrow: string;
      title: string;
      intro: string;
      entities: Entity[];
    };
    contact: {
      eyebrow: string;
      title: string;
      intro: string;
      cta: string;
      details: { label: string; value: string; pending?: boolean }[];
    };
    footer: {
      intro: string;
      siteTitle: string;
      toolsTitle: string;
      contactTitle: string;
      rights: string;
    };
  };
  header: {
    title: string;
  };
  common: {
    calculating: string;
  };
  addressSearch: {
    originPlaceholder: string;
    destPlaceholder: string;
    searching: string;
    searchFailed: string;
  };
  mapView: {
    origin: string;
    destination: string;
    waypoint: (index: number) => string;
    layers: {
      street: string;
      satellite: string;
      terrain: string;
      dark: string;
    };
    escToCancel: string;
  };
  quoteForm: {
    steps: { route: string; cargo: string; vehicle: string; cost: string };
    route: {
      originAddressLabel: string;
      originLatLabel: string;
      originLngLabel: string;
      pickOriginButton: string;
      pickingOrigin: string;
      destAddressLabel: string;
      destLatLabel: string;
      destLngLabel: string;
      pickDestButton: string;
      pickingDest: string;
      waypointsLabel: string;
      addWaypoint: string;
      deleteWaypoint: string;
      waypointIndex: (index: number) => string;
      waypointPlaceholder: string;
    };
    cargo: {
      weightLabel: string;
      volumeLabel: string;
      typeLabel: string;
      rateSuffix: (rate: number) => string;
      valueLabel: string;
    };
    vehicle: {
      loadingModeLabel: string;
      loadingModeConsolidatedLabel: string;
      loadingModeFullTruckLabel: string;
      loadingModeConsolidatedHint: string;
      loadingModeFullTruckHint: string;
      modelLabel: string;
      selectModel: string;
      specs: (maxLoad: number, fuel: number, rate: number, volume: number | null) => string;
      recommendedSuffix: string;
      suggestion: (cargoType: string, options: string) => string;
      emptyReturnLabel: string;
      needLoadingLabel: string;
      avoidRestrictedZonesLabel: string;
      avoidConstructionZonesLabel: string;
      viaMountainRoadLabel: string;
    };
    cost: {
      fuelPriceLabel: string;
      wageLabel: string;
      tollRateLabel: string;
      miscCostLabel: string;
      autoDefaultsHint: string;
    };
    buttons: {
      prev: string;
      next: string;
      submit: string;
      submitting: string;
      compare: string;
      comparing: string;
    };
  };
  border: {
    sectionTitle: string;
    transportMode: string;
    land: string;
    sea: string;
    hsCodeLabel: string;
    containerType: string;
    containerCount: string;
    chinaExport: string;
    borderCrossing: string;
    vietnamImport: string;
    importDuty: string;
    vat: string;
    subtotal: string;
    ddpTotal: string;
    transportLabel: string;
    // 🆕 两端分开报价
    modeToggle: string;
    transportOnly: string;
    ddpFull: string;
    transportOnlyHint: string;
    ddpFullHint: string;
    chinaSideTitle: string;
    vietnamSideTitle: string;
    ddpFullTotal: string;
    rateSource: string;
    itemLabels: Record<string, string>;
  };
  costPanel: {
    expandDetail: string;
    viewFullDetail: string;
    collapseDetail: string;
    volumeRatio: (pct: string) => string;
    panelTitle: string;
    collapsePanel: string;
    expandPanel: string;
    singleCostLabel: string;
    settingsTitle: string;
    calculating: string;
    fillFormHint: string;
    totalCost: string;
    distance: string;
    drivingTime: string;
    totalDuration: string;
    costPerKm: string;
    costPerTonKm: string;
    breakdownTitle: string;
    fullTruckBreakdownTitle: string;
    distanceCost: string;
    fullTruckDistanceCost: string;
    timeCost: string;
    fuelCost: string;
    loadingCost: string;
    insuranceCost: string;
    tollCost: string;
    portCost: string;
    bodySurchargeCost: string;
    restrictedZoneCost: string;
    constructionZoneCost: string;
    mountainRoadCost: string;
    miscCost: string;
    matchedModelLabel: string;
    capacityRatioLabel: string;
    suggestionsTitle: string;
    hours: string;
  };
  templateBar: {
    title: string;
    saveAsTemplate: string;
    manage: (count: number) => string;
    collapse: string;
    noTemplates: string;
    load: string;
    delete: string;
    promptName: string;
    confirmDelete: string;
    saveFailed: string;
    deleteFailed: string;
    loadFailed: string;
  };
  routeOptions: {
    title: (count: number) => string;
    option: (index: number) => string;
    cheapest: string;
    fastest: string;
    distanceAndTime: (distance: string, time: string) => string;
  };
  batch: {
    title: string;
    downloadTemplate: string;
    chooseFile: string;
    selectedFile: (name: string) => string;
    startCalc: (count: number) => string;
    calculating: string;
    parseFailed: string;
    parseErrorsTitle: string;
    summary: (total: number, success: number, failed: number) => string;
    filterAll: string;
    filterSuccess: string;
    filterFailed: string;
    export: string;
    colIndex: string;
    colLoadingMode: string;
    colVehicle: string;
    colCargo: string;
    colDistance: string;
    colCost: string;
    colStatus: string;
    statusSuccess: string;
    statusFailed: (error: string) => string;
    batchFailed: string;
  };
  errors: {
    setOriginDest: string;
    invalidWeight: string;
    computeFailed: string;
    alternativesFailed: string;
    loadVehiclePresetsFailed: string;
    volumeRequiredForConsolidated: string;
    selectVehicleModel: string;
    stepOriginRequired: string;
    stepDestRequired: string;
    stepWeightRequired: string;
    stepVolumeRequired: string;
    stepVehicleRequired: string;
    stepCargoTypeRequired: string;
  };
  labels: {
    vehicleCategory: Record<string, string>;
    cargoType: Record<string, string>;
    loadingMode: Record<string, string>;
  };
  suggestions: {
    heavy_load: string;
    empty_return_charged: string;
    overnight_rest: string;
    mismatched_cargo: (cargoType: string) => string;
    restricted_zone: string;
    construction_zone: string;
    mountain_road: string;
    consolidated_match: (modelName: string, capacityPct: string) => string;
  };
  cargoEstimate: {
    title: string;
    disclaimer: string;
    exportFee: string;
    importFee: string;
    perVehicle: string;
    estimatedDuty: string;
    estimatedVat: string;
    preciseNote: string;
  };
  multiTruck: {
    trucksNeeded: (weight: string | number, maxLoad: string | number, count: string | number) => string;
    oneTruckEnough: (pct: string | number) => string;
    perVehicle: (count: string | number, cost: string) => string;
    vehicleCount: string;
  };
}
