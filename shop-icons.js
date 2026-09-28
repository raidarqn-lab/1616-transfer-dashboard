// Original Nova line icons. Shared by the leadership and member calendars.
export const SHOP_TYPES = [
 ['bullseye','Bullseye Loot'],['ammo','Ammo Bonanza'],['drone','Drone Training Pass'],['weapon','Exclusive Weapon Battle Pass'],['moonstone','Moonstone Blessing'],['bounty','Bounty Hunter'],['growth','Hero Growth Battle Pass'],['market','Glittering Market'],['overlord','Overlord Training Battle Pass'],['training','Special Training Pass'],['energy','Energy Loot Quest'],['roulette','Hero Shard Roulette'],['custom','Custom Shop Event']
];
const paths={
 bullseye:'<circle cx="24" cy="24" r="16"/><circle cx="24" cy="24" r="9"/><circle cx="24" cy="24" r="2"/><path d="m24 24 17-17m-1 0h-7m7 0v7"/>',
 ammo:'<path d="M11 35V17l5-8 5 8v18m6 0V17l5-8 5 8v18M11 20h10m6 0h10M8 35h32v6H8z"/>',
 drone:'<rect x="18" y="19" width="12" height="10" rx="3"/><path d="m18 20-6-7m18 7 6-7m-18 15-6 7m18-7 6 7M24 29v6"/><ellipse cx="11" cy="11" rx="7" ry="4"/><ellipse cx="37" cy="11" rx="7" ry="4"/><ellipse cx="11" cy="37" rx="7" ry="4"/><ellipse cx="37" cy="37" rx="7" ry="4"/>',
 weapon:'<path d="M13 6h25l-5 36H8zM16 12h15M15 35h12m-9-7 10-10m-4-3 7 7m-14 3 5 5"/>',
 moonstone:'<path d="m24 5 13 9 4 18-17 11L7 32l4-18Z M11 14h26L24 43 11 14 24 5l13 9M7 32l17-7 17 7"/>',
 bounty:'<path d="M10 6h28v36H10zM16 13h16m-16 23h16"/><circle cx="24" cy="24" r="7"/><path d="M24 14v4m0 12v4M14 24h4m12 0h4"/>',
 growth:'<path d="M10 39V27h7v12m7 0V19h7v20m7 0V10M8 19 20 7m-8 0h8v8"/>',
 market:'<path d="M8 19h32v23H8zM5 19l5-12h28l5 12M18 42V29h12v13M16 7l-3 12m19-12 3 12M5 19q5 7 10 0 5 7 10 0 5 7 10 0 4 5 8 0"/>',
 overlord:'<path d="M14 10Q24 1 34 10l3 7q7-1 6 6l-5 6q-1 13-14 14Q11 42 10 29l-5-6q-1-7 6-6zM12 23l3-7 9 4 9-4 3 7M16 24h3m10 0h3M16 33q0-6 8-6t8 6v2q-8 6-16 0zM21 31h1m4 0h1M20 36h8"/>',
 training:'<path d="M9 15v18m6-24v30m18-30v30m6-24v18M15 24h18M5 19v10m38-10v10"/>',
 energy:'<path d="m27 4-18 24h14l-2 16 18-25H25z"/>',
 roulette:'<circle cx="24" cy="25" r="17"/><circle cx="24" cy="25" r="4"/><path d="M24 8v13m0 8v13M7 25h13m8 0h13M12 13l9 9m6 6 9 9M12 37l9-9m6-6 9-9M21 3h6l-3 6z"/>',
 custom:'<path d="M7 18h34v23H7zM5 12h38v8H5zM24 12v29M24 12C8 14 9 0 18 5l6 7c16 2 15-12 6-7z"/>'
};
export function shopIcon(type='custom'){return `<svg xmlns="http://www.w3.org/2000/svg" class="shop-icon" viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[type]||paths.custom}</svg>`;}
