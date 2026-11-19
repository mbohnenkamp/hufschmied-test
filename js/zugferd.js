// Erzeugt die XML-Datei (ZUGFeRD / Factur-X, Profil EN 16931), die in die PDF-Rechnung eingebettet wird.
import { centZuDezimal, rechnungsSummen, zeilenNetto, UST_SATZ } from './rechnen.js';

export const ZAHLARTEN = {
  bar: { text: 'Bar', code: '10' },
  ueberweisung: { text: 'Überweisung', code: '58' },
  paypal: { text: 'PayPal', code: '68' },
};

export const EINHEITEN = { C62: 'Stück', HUR: 'Stunde', KMT: 'km' };

function x(text) {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function datum102(iso) {
  return `<udt:DateTimeString format="102">${iso.replaceAll('-', '')}</udt:DateTimeString>`;
}

function adresse(a) {
  return `<ram:PostalTradeAddress><ram:PostcodeCode>${x(a.plz)}</ram:PostcodeCode><ram:LineOne>${x(a.strasse)}</ram:LineOne><ram:CityName>${x(a.ort)}</ram:CityName><ram:CountryID>DE</ram:CountryID></ram:PostalTradeAddress>`;
}

export function kundenName(kunde) {
  return kunde.firma ? kunde.firma : kunde.name;
}

export function zahlungsText(rechnung) {
  if (rechnung.typ === 'storno') return `Storno zur Rechnung ${rechnung.bezugNr}`;
  const zahlart = ZAHLARTEN[rechnung.zahlart].text;
  if (rechnung.bezahlt) return `Betrag erhalten (${zahlart}).`;
  return `Zahlbar per ${zahlart} bis ${rechnung.faelligAm.split('-').reverse().join('.')} ohne Abzug.`;
}

export function zugferdXml(rechnung, betrieb) {
  const summen = rechnungsSummen(rechnung.positionen);
  const bezahltCent = rechnung.bezahlt && rechnung.typ !== 'storno' ? summen.brutto : 0;

  const zeilen = rechnung.positionen
    .map(
      (p, i) => `<ram:IncludedSupplyChainTradeLineItem>
<ram:AssociatedDocumentLineDocument><ram:LineID>${i + 1}</ram:LineID></ram:AssociatedDocumentLineDocument>
<ram:SpecifiedTradeProduct><ram:Name>${x(p.bezeichnung)}</ram:Name></ram:SpecifiedTradeProduct>
<ram:SpecifiedLineTradeAgreement><ram:NetPriceProductTradePrice><ram:ChargeAmount>${centZuDezimal(p.einzelpreisCent)}</ram:ChargeAmount></ram:NetPriceProductTradePrice></ram:SpecifiedLineTradeAgreement>
<ram:SpecifiedLineTradeDelivery><ram:BilledQuantity unitCode="${p.einheit}">${Number(p.menge.toFixed(4))}</ram:BilledQuantity></ram:SpecifiedLineTradeDelivery>
<ram:SpecifiedLineTradeSettlement>
<ram:ApplicableTradeTax><ram:TypeCode>VAT</ram:TypeCode><ram:CategoryCode>S</ram:CategoryCode><ram:RateApplicablePercent>${UST_SATZ}</ram:RateApplicablePercent></ram:ApplicableTradeTax>
<ram:SpecifiedTradeSettlementLineMonetarySummation><ram:LineTotalAmount>${centZuDezimal(zeilenNetto(p.menge, p.einzelpreisCent))}</ram:LineTotalAmount></ram:SpecifiedTradeSettlementLineMonetarySummation>
</ram:SpecifiedLineTradeSettlement>
</ram:IncludedSupplyChainTradeLineItem>`,
    )
    .join('\n');

  const steuerIds = [
    betrieb.ustId ? `<ram:SpecifiedTaxRegistration><ram:ID schemeID="VA">${x(betrieb.ustId)}</ram:ID></ram:SpecifiedTaxRegistration>` : '',
    betrieb.steuernummer ? `<ram:SpecifiedTaxRegistration><ram:ID schemeID="FC">${x(betrieb.steuernummer)}</ram:ID></ram:SpecifiedTaxRegistration>` : '',
  ].join('');

  const konto =
    rechnung.zahlart === 'ueberweisung' && betrieb.iban
      ? `<ram:PayeePartyCreditorFinancialAccount><ram:IBANID>${x(betrieb.iban.replace(/\s/g, ''))}</ram:IBANID></ram:PayeePartyCreditorFinancialAccount>`
      : '';

  const faellig = !rechnung.bezahlt && rechnung.typ !== 'storno' ? `<ram:DueDateDateTime>${datum102(rechnung.faelligAm)}</ram:DueDateDateTime>` : '';

  const bezug = rechnung.typ === 'storno' ? `<ram:InvoiceReferencedDocument><ram:IssuerAssignedID>${x(rechnung.bezugNr)}</ram:IssuerAssignedID></ram:InvoiceReferencedDocument>` : '';

  return `<?xml version="1.0" encoding="UTF-8"?>
<rsm:CrossIndustryInvoice xmlns:rsm="urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100" xmlns:qdt="urn:un:unece:uncefact:data:standard:QualifiedDataType:100" xmlns:ram="urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100" xmlns:udt="urn:un:unece:uncefact:data:standard:UnqualifiedDataType:100">
<rsm:ExchangedDocumentContext><ram:GuidelineSpecifiedDocumentContextParameter><ram:ID>urn:cen.eu:en16931:2017</ram:ID></ram:GuidelineSpecifiedDocumentContextParameter></rsm:ExchangedDocumentContext>
<rsm:ExchangedDocument>
<ram:ID>${x(rechnung.nr)}</ram:ID>
<ram:TypeCode>${rechnung.typ === 'storno' ? '381' : '380'}</ram:TypeCode>
<ram:IssueDateTime>${datum102(rechnung.datum)}</ram:IssueDateTime>
</rsm:ExchangedDocument>
<rsm:SupplyChainTradeTransaction>
${zeilen}
<ram:ApplicableHeaderTradeAgreement>
<ram:SellerTradeParty><ram:Name>${x(betrieb.name)}</ram:Name>${adresse(betrieb)}${betrieb.email ? `<ram:URIUniversalCommunication><ram:URIID schemeID="EM">${x(betrieb.email)}</ram:URIID></ram:URIUniversalCommunication>` : ''}${steuerIds}</ram:SellerTradeParty>
<ram:BuyerTradeParty><ram:Name>${x(kundenName(rechnung.kunde))}</ram:Name>${adresse(rechnung.kunde)}${rechnung.kunde.email ? `<ram:URIUniversalCommunication><ram:URIID schemeID="EM">${x(rechnung.kunde.email)}</ram:URIID></ram:URIUniversalCommunication>` : ''}</ram:BuyerTradeParty>
</ram:ApplicableHeaderTradeAgreement>
<ram:ApplicableHeaderTradeDelivery><ram:ActualDeliverySupplyChainEvent><ram:OccurrenceDateTime>${datum102(rechnung.leistungsdatum)}</ram:OccurrenceDateTime></ram:ActualDeliverySupplyChainEvent></ram:ApplicableHeaderTradeDelivery>
<ram:ApplicableHeaderTradeSettlement>
<ram:InvoiceCurrencyCode>EUR</ram:InvoiceCurrencyCode>
<ram:SpecifiedTradeSettlementPaymentMeans><ram:TypeCode>${ZAHLARTEN[rechnung.zahlart].code}</ram:TypeCode><ram:Information>${x(ZAHLARTEN[rechnung.zahlart].text)}</ram:Information>${konto}</ram:SpecifiedTradeSettlementPaymentMeans>
<ram:ApplicableTradeTax><ram:CalculatedAmount>${centZuDezimal(summen.ust)}</ram:CalculatedAmount><ram:TypeCode>VAT</ram:TypeCode><ram:BasisAmount>${centZuDezimal(summen.netto)}</ram:BasisAmount><ram:CategoryCode>S</ram:CategoryCode><ram:RateApplicablePercent>${UST_SATZ}</ram:RateApplicablePercent></ram:ApplicableTradeTax>
<ram:SpecifiedTradePaymentTerms><ram:Description>${x(zahlungsText(rechnung))}</ram:Description>${faellig}</ram:SpecifiedTradePaymentTerms>
<ram:SpecifiedTradeSettlementHeaderMonetarySummation><ram:LineTotalAmount>${centZuDezimal(summen.netto)}</ram:LineTotalAmount><ram:TaxBasisTotalAmount>${centZuDezimal(summen.netto)}</ram:TaxBasisTotalAmount><ram:TaxTotalAmount currencyID="EUR">${centZuDezimal(summen.ust)}</ram:TaxTotalAmount><ram:GrandTotalAmount>${centZuDezimal(summen.brutto)}</ram:GrandTotalAmount><ram:TotalPrepaidAmount>${centZuDezimal(bezahltCent)}</ram:TotalPrepaidAmount><ram:DuePayableAmount>${centZuDezimal(summen.brutto - bezahltCent)}</ram:DuePayableAmount></ram:SpecifiedTradeSettlementHeaderMonetarySummation>
${bezug}
</ram:ApplicableHeaderTradeSettlement>
</rsm:SupplyChainTradeTransaction>
</rsm:CrossIndustryInvoice>
`;
}
