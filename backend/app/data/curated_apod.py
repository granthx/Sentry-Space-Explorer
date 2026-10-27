"""Curated gallery of authentic NASA Astronomy & Planetary imagery.

Used as a fallback when NASA's upstream APOD API is unavailable,
times out, or returns generic placeholder responses (e.g. the WordPress 'nasa-logo@2x.png').
All URLs point directly to official NASA assets on images-assets.nasa.gov.
"""

from __future__ import annotations

from typing import Any

CURATED_APOD_GALLERY: list[dict[str, Any]] = [
    {
        "date": "2024-10-31",
        "title": "Cosmic Cliffs in the Carina Nebula",
        "explanation": "What looks like craggy mountains on a moonlit evening is actually the edge of the young, star-forming region NGC 3324 in the Carina Nebula. Captured in infrared light by NASA's James Webb Space Telescope, this image reveals previously obscured areas of star birth.",
        "media_type": "image",
        "url": "https://images-assets.nasa.gov/image/carina_nebula/carina_nebula~medium.jpg",
        "hd_url": "https://images-assets.nasa.gov/image/carina_nebula/carina_nebula~large.jpg",
        "thumbnail_url": None,
        "copyright": "NASA, ESA, CSA, STScI",
    },
    {
        "date": "2024-07-12",
        "title": "Webb's First Deep Field (SMACS 0723)",
        "explanation": "NASA's James Webb Space Telescope delivered the deepest and sharpest infrared image of the distant universe so far. Thousands of galaxies—including the faintest objects ever observed in the infrared—have appeared in Webb's view for the first time.",
        "media_type": "image",
        "url": "https://images-assets.nasa.gov/image/PIA25433/PIA25433~medium.jpg",
        "hd_url": "https://images-assets.nasa.gov/image/PIA25433/PIA25433~large.jpg",
        "thumbnail_url": None,
        "copyright": "NASA, ESA, CSA, STScI",
    },
    {
        "date": "2023-11-09",
        "title": "Pillars of Creation: Mountains of Stellar Birth",
        "explanation": "This majestic infrared image from NASA's Spitzer Space Telescope shows the towering pillars where stars are born in the Eagle Nebula (M16). These dense columns of cool gas and dust are illuminated at their tips by embryonic stars forming within.",
        "media_type": "image",
        "url": "https://images-assets.nasa.gov/image/PIA03096/PIA03096~medium.jpg",
        "hd_url": "https://images-assets.nasa.gov/image/PIA03096/PIA03096~large.jpg",
        "thumbnail_url": None,
        "copyright": "NASA, JPL-Caltech",
    },
    {
        "date": "2023-08-15",
        "title": "Curiosity Rover: High-Resolution Martian Selfie at Glen Etive",
        "explanation": "NASA's Curiosity rover captured this 360-degree self-portrait on Sol 2,553 of its mission in Gale Crater on Mars. In the background, Vera Rubin Ridge rises nearly 300 meters above the crater floor, highlighting the sedimentary layers of Mount Sharp.",
        "media_type": "image",
        "url": "https://images-assets.nasa.gov/image/PIA23378/PIA23378~medium.jpg",
        "hd_url": "https://images-assets.nasa.gov/image/PIA23378/PIA23378~large.jpg",
        "thumbnail_url": None,
        "copyright": "NASA, JPL-Caltech, MSSS",
    },
    {
        "date": "2023-05-20",
        "title": "Hubble's Panoramic Portrait of the Andromeda Galaxy (M31)",
        "explanation": "The largest composite image ever assembled by the Hubble Space Telescope reveals a sweeping view of our spiral neighbor, the Andromeda Galaxy. Located 2.5 million light-years away, Andromeda contains more than one trillion stars.",
        "media_type": "image",
        "url": "https://images-assets.nasa.gov/image/GSFC_20171208_Archive_e000833/GSFC_20171208_Archive_e000833~medium.jpg",
        "hd_url": "https://images-assets.nasa.gov/image/GSFC_20171208_Archive_e000833/GSFC_20171208_Archive_e000833~large.jpg",
        "thumbnail_url": None,
        "copyright": "NASA, ESA, J. Dalcanton, B. F. Williams",
    },
    {
        "date": "2022-12-05",
        "title": "Perseverance Rover on Mars: Jezero Crater River Delta",
        "explanation": "NASA's Perseverance Mars rover surveys the ancient river delta in Jezero Crater. Billions of years ago, a raging river deposited mud and sand here, creating an ideal geological environment to preserve organic biosignatures.",
        "media_type": "image",
        "url": "https://images-assets.nasa.gov/image/PIA24320/PIA24320~medium.jpg",
        "hd_url": "https://images-assets.nasa.gov/image/PIA24320/PIA24320~large.jpg",
        "thumbnail_url": None,
        "copyright": "NASA, JPL-Caltech",
    },
    {
        "date": "2022-09-18",
        "title": "Juno's Jovian Vista: Jupiter's Great Red Spot",
        "explanation": "NASA's Juno spacecraft swooped past Jupiter to capture the swirling anticyclonic storm known as the Great Red Spot. The tempest is larger than planet Earth and has been raging in Jupiter's upper atmosphere for over 300 years.",
        "media_type": "image",
        "url": "https://images-assets.nasa.gov/image/PIA21770/PIA21770~medium.jpg",
        "hd_url": "https://images-assets.nasa.gov/image/PIA21770/PIA21770~large.jpg",
        "thumbnail_url": None,
        "copyright": "NASA, JPL-Caltech, SwRI, MSSS",
    },
    {
        "date": "2022-04-18",
        "title": "Ingenuity Mars Helicopter: Flight Across the Red Planet",
        "explanation": "NASA's Ingenuity Mars Helicopter completed historic powered, controlled flight in the razor-thin atmosphere of Mars, proving that aerial exploration of other worlds is possible. Here it glides above the crater dunes of Jezero.",
        "media_type": "image",
        "url": "https://images-assets.nasa.gov/image/PIA25321/PIA25321~medium.jpg",
        "hd_url": "https://images-assets.nasa.gov/image/PIA25321/PIA25321~large.jpg",
        "thumbnail_url": None,
        "copyright": "NASA, JPL-Caltech",
    },
    {
        "date": "2021-10-12",
        "title": "Cassini's Infrared Portrait of Saturn and Its Rings",
        "explanation": "In this false-color view captured by the Cassini spacecraft, Saturn's rings shine like delicate bands of ice and dust while thermal infrared emissions highlight deep convective cloud belts in the gas giant's southern hemisphere.",
        "media_type": "image",
        "url": "https://images-assets.nasa.gov/image/PIA13405/PIA13405~medium.jpg",
        "hd_url": "https://images-assets.nasa.gov/image/PIA13405/PIA13405~large.jpg",
        "thumbnail_url": None,
        "copyright": "NASA, JPL-Caltech, ASI, University of Arizona",
    },
    {
        "date": "2021-06-08",
        "title": "Orion Nebula and Stellar Bow Shock",
        "explanation": "Located 1,500 light-years away, the Great Orion Nebula is a rich stellar nursery. The high-velocity solar wind from a newborn star slams into the surrounding interstellar gas cloud, creating a brilliant curved bow shock wave.",
        "media_type": "image",
        "url": "https://images-assets.nasa.gov/image/PIA04227/PIA04227~medium.jpg",
        "hd_url": "https://images-assets.nasa.gov/image/PIA04227/PIA04227~large.jpg",
        "thumbnail_url": None,
        "copyright": "NASA, ESA, Hubble Heritage Team",
    },
    {
        "date": "2020-08-25",
        "title": "The Sombrero Galaxy (Messier 104)",
        "explanation": "Resembling a wide-brimmed Mexican hat, the Sombrero Galaxy features a brilliant white bulbous core encircled by thick dust lanes. Spanning 50,000 light-years across, M104 contains a supermassive central black hole of one billion solar masses.",
        "media_type": "image",
        "url": "https://images-assets.nasa.gov/image/0700064/0700064~medium.jpg",
        "hd_url": "https://images-assets.nasa.gov/image/0700064/0700064~large.jpg",
        "thumbnail_url": None,
        "copyright": "NASA, STScI",
    },
    {
        "date": "2020-03-14",
        "title": "Crab Nebula: Echoes of an Ancient Supernova",
        "explanation": "The Crab Nebula is the shattered remnant of a colossal supernova explosion documented by astronomers on Earth in 1054 AD. At its core spins a rapidly pulsing neutron star (pulsar) rotating 30 times every second.",
        "media_type": "image",
        "url": "https://images-assets.nasa.gov/image/PIA17563/PIA17563~medium.jpg",
        "hd_url": "https://images-assets.nasa.gov/image/PIA17563/PIA17563~large.jpg",
        "thumbnail_url": None,
        "copyright": "NASA, ESA, Herschel, Hubble",
    },
    {
        "date": "2019-11-20",
        "title": "Curiosity Explores the Lower Slopes of Mount Sharp",
        "explanation": "Traversing the Martian terrain from Bradbury Landing toward the Pahrump Hills, NASA's Curiosity rover maps the ancient lake deposits of Mars to discover how the Red Planet transformed from a wet world to a cold desert.",
        "media_type": "image",
        "url": "https://images-assets.nasa.gov/image/PIA19067/PIA19067~medium.jpg",
        "hd_url": "https://images-assets.nasa.gov/image/PIA19067/PIA19067~large.jpg",
        "thumbnail_url": None,
        "copyright": "NASA, JPL-Caltech",
    },
    {
        "date": "2019-04-10",
        "title": "Apollo 11: Earthrise Over the Moon",
        "explanation": "One of the most famous space photographs ever captured: our home planet Earth rises above the barren cratered horizon of the Moon, showcasing our fragile world suspended in the deep cosmic void.",
        "media_type": "image",
        "url": "https://images-assets.nasa.gov/image/as11-44-6551/as11-44-6551~medium.jpg",
        "hd_url": "https://images-assets.nasa.gov/image/as11-44-6551/as11-44-6551~large.jpg",
        "thumbnail_url": None,
        "copyright": "NASA, Apollo 11",
    },
    {
        "date": "2018-09-02",
        "title": "The Whispering Arms of the Spiral Galaxy NGC 3079",
        "explanation": "Located roughly 50 million light-years away in the constellation Ursa Major, NGC 3079 is a magnificent spiral galaxy with immense bubbles of hot gas erupting from its galactic center.",
        "media_type": "image",
        "url": "https://images-assets.nasa.gov/image/PIA04208/PIA04208~medium.jpg",
        "hd_url": "https://images-assets.nasa.gov/image/PIA04208/PIA04208~large.jpg",
        "thumbnail_url": None,
        "copyright": "NASA, JPL-Caltech",
    },
]


def get_curated_apod_for_date(target_date: str) -> dict[str, Any]:
    """Deterministically pick a curated masterwork for a given YYYY-MM-DD date."""
    # Compute deterministic index from the date string so the same day always shows the same photo
    try:
        parts = [int(p) for p in target_date.split("-")]
        seed = parts[0] * 372 + parts[1] * 31 + parts[2]
    except Exception:
        seed = sum(ord(c) for c in target_date)

    chosen = dict(CURATED_APOD_GALLERY[seed % len(CURATED_APOD_GALLERY)])
    chosen["date"] = target_date
    return chosen

