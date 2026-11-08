import { getApiKey } from './store';
import { STYLES, EVENTS } from './constants';

// Modèles Gemini essayés dans l'ordre. Chaque modèle a son propre quota gratuit :
// quand l'un est épuisé (ou indisponible), l'app passe automatiquement au suivant.
const MODELS = ['gemini-3.6-flash', 'gemini-3.8-flash', 'gemini-3.5-flash-lite', 'gemini-3.1-flash-lite'];
let preferred = 0; // dernier modèle qui a fonctionné

const urlFor = (model) => `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

function friendlyError(status, message, retry) {
  if (status === 429) {
    return `Quota gratuit Gemini épuisé pour aujourd'hui sur tous les modèles${retry ? ` (retour dans environ ${retry})` : ''}. Réessaie plus tard, ou active la facturation sur aistudio.google.com pour lever la limite.`;
  }
  if (status === 400 && /API key/i.test(message || '')) return 'Clé API Gemini invalide. Vérifie-la dans Réglages.';
  return message || `Erreur API Gemini (${status})`;
}

async function callGemini(parts, maxTokens = 1200) {
  const key = await getApiKey();
  if (!key) throw new Error("Ajoute ta clé API Gemini dans l'onglet Réglages.");
  let last = { status: 0, message: '', retry: '' };
  for (let n = 0; n < MODELS.length; n++) {
    const i = (preferred + n) % MODELS.length;
    const res = await fetch(urlFor(MODELS[i]), {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({
        contents: [{ role: 'user', parts }],
        generationConfig: {
          responseMimeType: 'application/json',
          maxOutputTokens: maxTokens,
          temperature: 0.6,
        },
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      const text = (data.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join('');
      if (!text) throw new Error("Gemini n'a rien renvoyé, réessaie.");
      preferred = i;
      return text;
    }
    const message = data?.error?.message || '';
    const retry = (/retry in ([0-9hms.]+?)s?\./i.exec(message) || [])[1] || '';
    last = { status: res.status, message, retry: retry.replace(/\.\d+/, '') };
    // Quota épuisé, modèle introuvable ou surchargé : on essaie le modèle suivant.
    if ([429, 404, 503, 500].includes(res.status)) continue;
    break;
  }
  throw new Error(friendlyError(last.status, last.message, last.retry));
}

function parseJSON(text) {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("Réponse de l'IA illisible, réessaie.");
  return JSON.parse(match[0]);
}

// Analyse une tenue (photo en base64 JPEG et/ou description) et la catégorise.
export async function analyzeOutfit({ base64, description }) {
  const prompt = `Analyse cette tenue et réponds UNIQUEMENT avec un objet JSON valide.
${description ? `Description fournie par l'utilisateur : "${description}"` : ''}

Format attendu :
{
  "name": "nom court et parlant de la tenue (max 5 mots)",
  "items": ["liste des pièces visibles"],
  "colors": ["couleurs dominantes"],
  "style": un de ${JSON.stringify(STYLES)},
  "events": sous-ensemble de ${JSON.stringify(EVENTS)},
  "temp_min": température ressentie minimale (°C, entier) pour laquelle la tenue reste confortable. Sois réaliste et strict : un short et un t-shirt ne sont PAS confortables sous 18°C,
  "temp_max": température ressentie maximale (°C, entier) pour laquelle la tenue reste confortable. Un manteau épais n'est PAS confortable au-dessus de 12°C,
  "warmth": chaleur de 1 à 5 : 1 = short/t-shirt (chaud, 20°C et +), 2 = léger (pantalon fin, chemise, 14-30°C), 3 = mi-saison (pull ou veste fine, 8-22°C), 4 = chaud (manteau, 0-14°C), 5 = grand froid (doudoune, bonnet, -10-8°C),
  "waterproof": true si la tenue protège correctement de la pluie (veste imperméable, etc.), sinon false
}`;

  const parts = [];
  if (base64) parts.push({ inline_data: { mime_type: 'image/jpeg', data: base64 } });
  parts.push({ text: prompt });

  const r = parseJSON(await callGemini(parts));
  return {
    name: r.name || 'Nouvelle tenue',
    items: Array.isArray(r.items) ? r.items : [],
    colors: Array.isArray(r.colors) ? r.colors : [],
    style: STYLES.includes(r.style) ? r.style : 'Casual',
    events: (r.events || []).filter((e) => EVENTS.includes(e)),
    tempMin: Number.isFinite(+r.temp_min) ? Math.round(+r.temp_min) : 8,
    tempMax: Number.isFinite(+r.temp_max) ? Math.round(+r.temp_max) : 20,
    warmth: Math.min(5, Math.max(1, Math.round(+r.warmth || 3))),
    waterproof: !!r.waterproof,
  };
}

// Idées de tenues par style, adaptées à la météo, avec une recherche Pinterest associée.
export async function suggestIdeas({ styles, weather, gender }) {
  const prompt = `Propose 1 idée de tenue pour chacun de ces styles : ${styles.join(', ')}.
Météo du jour : ${weather}.
${gender ? `Public visé : ${gender}.` : ''}
Les tenues doivent être adaptées à la météo. Réponds UNIQUEMENT avec un JSON valide :
{"ideas":[{"style":"...","title":"titre court","description":"1 à 2 phrases avec les pièces","pinterest_query":"requête de recherche Pinterest en anglais, 4 à 7 mots"}]}`;
  const r = parseJSON(await callGemini([{ text: prompt }], 1500));
  return (r.ideas || []).map((i) => ({
    style: i.style,
    title: i.title,
    description: i.description,
    query: i.pinterest_query,
  }));
}

// ---------- Pièces séparées ----------

import { CATEGORIES } from './constants';

// Analyse une pièce seule (haut, bas, chaussures, veste).
export async function analyzePiece({ base64, description }) {
  const prompt = `Analyse ce vêtement (une seule pièce) et réponds UNIQUEMENT avec un objet JSON valide.
${description ? `Description fournie par l'utilisateur : "${description}"` : ''}

Format attendu :
{
  "name": "nom court (ex : T-shirt blanc, Jean noir slim, Baskets blanches)",
  "category": un de ${JSON.stringify(CATEGORIES)},
  "colors": ["couleurs dominantes"],
  "style": un de ${JSON.stringify(STYLES)},
  "events": sous-ensemble de ${JSON.stringify(EVENTS)},
  "warmth": chaleur de la pièce de 1 à 5 : 1 = très léger (t-shirt, short, sandales), 2 = léger (chemise, pantalon fin, baskets), 3 = moyen (pull fin, jean, sweat léger), 4 = chaud (gros pull, hoodie épais, bottes), 5 = très chaud (doudoune, manteau d'hiver),
  "waterproof": true uniquement si la pièce protège vraiment de la pluie (imperméable, k-way, bottes de pluie)
}`;
  const parts = [];
  if (base64) parts.push({ inline_data: { mime_type: 'image/jpeg', data: base64 } });
  parts.push({ text: prompt });
  const r = parseJSON(await callGemini(parts));
  return {
    name: r.name || 'Nouvelle pièce',
    category: CATEGORIES.includes(r.category) ? r.category : 'Haut',
    colors: Array.isArray(r.colors) ? r.colors : [],
    style: STYLES.includes(r.style) ? r.style : 'Casual',
    events: (r.events || []).filter((e) => EVENTS.includes(e)),
    warmth: Math.min(5, Math.max(1, Math.round(+r.warmth || 3))),
    waterproof: !!r.waterproof,
  };
}

// ---------- Idées d'achat ----------

// Repère ce qui manque dans la garde-robe et propose quoi acheter.
export async function suggestPurchases({ outfits, pieces, climate, gender }) {
  const o = outfits.map(
    (x) => `- ${x.name} (${x.style}, chaleur ${x.warmth}/5, ${x.tempMin}° à ${x.tempMax}°, ${x.waterproof ? 'imperméable' : 'non imperméable'}, événements : ${(x.events || []).join(', ') || 'aucun'})`
  );
  const p = pieces.map((x) => `- ${x.category} : ${x.name} (${x.style}, chaleur ${x.warmth}/5${x.waterproof ? ', imperméable' : ''})`);
  const prompt = `Tu es styliste. Voici la garde-robe d'une personne${gender ? ` (${gender})` : ''}.

Tenues complètes :
${o.join('\n') || '(aucune)'}

Pièces séparées :
${p.join('\n') || '(aucune)'}

Climat des 7 prochains jours : ${climate}.

Repère les VRAIS manques (ex : rien pour le froid humide, aucune tenue de travail, pas d'imperméable, peu de chaussures) et propose 4 achats concrets et polyvalents qui créent le plus de nouvelles tenues possibles. Réponds UNIQUEMENT avec un JSON valide :
{"gaps":["manque 1","manque 2"],"items":[{"item":"nom de la pièce","why":"1 phrase : pourquoi elle comble un manque","pinterest_query":"requête Pinterest en anglais pour voir comment la porter, 4 à 7 mots"}]}`;
  const r = parseJSON(await callGemini([{ text: prompt }], 1500));
  return {
    gaps: Array.isArray(r.gaps) ? r.gaps : [],
    items: (r.items || []).map((i) => ({ item: i.item, why: i.why, query: i.pinterest_query })),
  };
}

// ---------- Image générée par Gemini ----------

const IMAGE_MODEL = 'gemini-3.1-flash-image';

// Génère une image d'inspiration pour une idée de tenue. Renvoie une data URI.
export async function generateOutfitImage({ title, description, style, gender }) {
  const key = await getApiKey();
  if (!key) throw new Error("Ajoute ta clé API Gemini dans l'onglet Réglages.");
  const prompt = `Photo de mode réaliste, tenue complète vue en pied sur fond neutre clair, style ${style}${gender ? `, pour ${gender}` : ''}. ${title}. ${description}. Pas de texte, pas de logo.`;
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${IMAGE_MODEL}:generateContent`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { responseModalities: ['IMAGE'] },
      }),
    }
  );
  const data = await res.json();
  if (!res.ok) throw new Error(res.status === 429 ? "Quota gratuit d'images Gemini épuisé pour aujourd'hui. Réessaie plus tard." : data?.error?.message || `Erreur génération d'image (${res.status})`);
  const parts = data.candidates?.[0]?.content?.parts || [];
  const img = parts.map((p) => p.inlineData || p.inline_data).find(Boolean);
  if (!img?.data) throw new Error("Gemini n'a pas renvoyé d'image, réessaie.");
  return `data:${img.mimeType || img.mime_type || 'image/png'};base64,${img.data}`;
}
