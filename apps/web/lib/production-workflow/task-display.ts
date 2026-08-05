export const trackLabels: Record<string, string> = {
  apparel: "Apparel",
  artwork: "Artwork",
  customer_fulfillment: "Customer Fulfillment",
  production: "Production",
  production_prep: "Production Prep",
};

export const taskPhaseLabels: Record<string, string[]> = {
  "apparel.confirm_garment_requirements": ["Needs sourcing"],
  "apparel.build_supplier_cart": ["Needs sourcing"],
  "apparel.approve_cart": ["Needs sourcing"],
  "apparel.order_apparel": ["Needs sourcing", "Awaiting goods"],
  "apparel.apparel_shipped": ["Awaiting goods"],
  "apparel.apparel_received": ["Goods received"],
  "art.confirm_artwork_needed": ["Needs sourcing"],
  "art.create_revise_artwork": ["Needs sourcing"],
  "art.send_artwork_approval": ["Needs sourcing"],
  "art.artwork_approved": ["Ready for production"],
  "art.ready_to_burn_screens": ["Ready for production"],
  "prep.burn_screens": ["Ready for production"],
  "prep.confirm_print_locations": ["Ready for production"],
  "prep.confirm_ink_color_count": ["Ready for production"],
  "prep.confirm_garment_handling": ["Ready for production"],
  "prep.confirm_finishing_requirements": ["Ready for production"],
  "prep.estimate_difficulty_time": ["Ready for production"],
  "prep.assign_press_day": ["Scheduled"],
  "production.ready_for_production": ["Ready for production"],
  "production.in_production": ["In production"],
  "production.finishing_qc": ["Finishing / QC"],
  "production.production_complete": ["Production complete"],
  "fulfillment.ready_inventory": ["After production complete"],
  "fulfillment.shipped_picked_up": ["After production complete"],
  "fulfillment.received_by_customer": ["After production complete"],
};

export function labelForTrack(track: string) {
  return trackLabels[track] ?? track.replaceAll("_", " ");
}

export function phasesForTask(workflowStepKey: string) {
  return taskPhaseLabels[workflowStepKey] ?? ["Phase mapping pending"];
}
