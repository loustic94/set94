/**
 * Envoi du mail de bienvenue de saison
 * -------------------------------------
 * Lit les membres "Actifs" n'ayant pas encore reçu le mail de saison,
 * envoie un mail HTML basé sur un template hébergé en externe (GitHub Pages),
 * puis coche "Mail saison envoyé" pour ne jamais le renvoyer.
 *
 * Pré-requis Airtable :
 * - Champ "Mail saison envoyé" (case à cocher) dans la table Membres
 * - Une automatisation Airtable qui DÉCOCHE ce champ quand Statut repasse à Actif
 *   (les nouveaux membres sont déjà décochés par défaut, rien à faire pour eux)
 */

// ============================================
// CONFIG - à adapter à vos noms de champs exacts
// ============================================
const CONFIG = {
  AIRTABLE_PAT: 'VOTRE_PAT_AIRTABLE',
  BASE_ID: 'appXXXXXXXXXXXXXX',
  TABLE_MEMBRES: 'Membres',

  CHAMP_STATUT: 'Statut',
  VALEUR_STATUT_ACTIF: 'Actif',
  CHAMP_MAIL_ENVOYE: 'Mail saison envoyé',
  CHAMP_EMAIL: 'Adresse email',
  CHAMP_PRENOM: 'Prénom',

  // Fichier HTML externe servant de corps de mail (ex: hébergé sur GitHub Pages)
  URL_TEMPLATE_HTML: 'https://loustic94.github.io/set94/mail_bienvenue_saison.html',
  SUJET_MAIL: 'Bienvenue pour la nouvelle saison SET !',
  NOM_EXPEDITEUR: 'SET - Société en Transition',

  // Pause entre deux envois, pour rester sous les limites de débit Airtable/Gmail
  DELAI_ENTRE_ENVOIS_MS: 1100
};

const API_BASE = `https://api.airtable.com/v0/${CONFIG.BASE_ID}`;
const HEADERS = {
  'Authorization': `Bearer ${CONFIG.AIRTABLE_PAT}`,
  'Content-Type': 'application/json'
};

// ============================================
// Point d'entrée principal - à lancer manuellement
// ou via un déclencheur horaire (voir instructions de déploiement)
// ============================================
function envoyerMailsSaison() {
  const template = recupererTemplateHtml();
  const membres = recupererMembresAEnvoyer();

  Logger.log(`${membres.length} membre(s) à traiter.`);

  membres.forEach(membre => {
    const email = membre.fields[CONFIG.CHAMP_EMAIL];
    try {
      envoyerMailPourMembre(membre, template);
      marquerMailEnvoye(membre.id);
      Logger.log(`✓ Mail envoyé à ${email}`);
    } catch (e) {
      // On ne coche PAS le champ en cas d'échec : ce membre sera
      // retenté automatiquement au prochain passage du script.
      Logger.log(`✗ Erreur pour ${email} : ${e.message}`);
    }
    Utilities.sleep(CONFIG.DELAI_ENTRE_ENVOIS_MS);
  });

  Logger.log('Traitement terminé.');
}

// ============================================
// Récupérer le template HTML externe (une seule fois pour tout le lot)
// ============================================
function recupererTemplateHtml() {
  const response = UrlFetchApp.fetch(CONFIG.URL_TEMPLATE_HTML, { muteHttpExceptions: true });
  if (response.getResponseCode() !== 200) {
    throw new Error('Impossible de récupérer le template HTML (code ' + response.getResponseCode() + ')');
  }
  return response.getContentText();
}

// ============================================
// Récupérer les membres Actifs n'ayant pas encore reçu le mail
// ============================================
function recupererMembresAEnvoyer() {
  const formula = `AND({${CONFIG.CHAMP_STATUT}} = "${CONFIG.VALEUR_STATUT_ACTIF}", NOT({${CONFIG.CHAMP_MAIL_ENVOYE}}))`;
  const url = `${API_BASE}/${encodeURIComponent(CONFIG.TABLE_MEMBRES)}?filterByFormula=${encodeURIComponent(formula)}`;

  const response = UrlFetchApp.fetch(url, { headers: HEADERS, muteHttpExceptions: true });
  if (response.getResponseCode() !== 200) {
    throw new Error('Erreur Airtable (lecture membres) : ' + response.getContentText());
  }
  return JSON.parse(response.getContentText()).records;
}

// ============================================
// Envoyer le mail à un membre, en personnalisant le template
// Placeholder disponible dans le HTML : {{PRENOM}}
// ============================================
function envoyerMailPourMembre(membre, template) {
  const email = membre.fields[CONFIG.CHAMP_EMAIL];
  if (!email) throw new Error("Pas d'adresse email pour ce membre");

  const prenom = membre.fields[CONFIG.CHAMP_PRENOM] || '';
  const corpsPersonnalise = template.replace(/{{PRENOM}}/g, prenom);

  GmailApp.sendEmail(email, CONFIG.SUJET_MAIL, '', {
    htmlBody: corpsPersonnalise,
    name: CONFIG.NOM_EXPEDITEUR
  });
}

// ============================================
// Marquer le membre comme ayant reçu le mail (coche le champ)
// ============================================
function marquerMailEnvoye(membreId) {
  const url = `${API_BASE}/${encodeURIComponent(CONFIG.TABLE_MEMBRES)}/${membreId}`;
  const payload = { fields: { [CONFIG.CHAMP_MAIL_ENVOYE]: true } };

  const response = UrlFetchApp.fetch(url, {
    method: 'patch',
    headers: HEADERS,
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });

  if (response.getResponseCode() !== 200) {
    throw new Error('Erreur mise à jour Airtable : ' + response.getContentText());
  }
}
