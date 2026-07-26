(() => {
  'use strict';
  const FN = 'credit-packages-panel';
  let data = null;
  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');
  const money = cents => new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(cents||0)/100);
  const date = value => {
    if (!value) return '—';
    const raw = String(value);
    const parsed = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? new Date(`${raw}T12:00:00`) : new Date(raw);
    return Number.isNaN(parsed.getTime()) ? '—' : parsed.toLocaleDateString('pt-BR');
  };
  const paymentLabels = { paid:'Pago', pending:'Pendente', overdue:'Atrasado', cancelled:'Cancelado' };
  const creditLabels = { released:'Liberados', waiting_payment:'Aguardando pagamento', cancelled:'Cancelados', expired:'Expirados' };
  const paymentLabel = value => paymentLabels[value] || value || '—';
  const creditLabel = value => creditLabels[value] || value || '—';

  async function api(payload) {
    const config = window.RONECA_PANEL_CONFIG || {};
    const token = await window.RonecaPanelAuth?.getAccessToken?.();
    if (!config.supabaseUrl || !config.anonKey || !token) throw new Error('Sessão do painel indisponível.');
    const response = await fetch(`${String(config.supabaseUrl).replace(/\/$/,'')}/functions/v1/${FN}`, {
      method:'POST', cache:'no-store', headers:{'Content-Type':'application/json',apikey:config.anonKey,Authorization:`Bearer ${token}`},
      body:JSON.stringify(payload),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || 'Falha na operação.');
    return result;
  }

  function operationKey(prefix){ return `${prefix}:${crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`}`; }

  function adminHtml(){
    return `<div class="credit-packages-shell">
      <div class="credit-packages-head"><div><small>Financeiro da empresa</small><h2>Venda de créditos</h2><p>Somente compras de créditos feitas pelos vendedores aparecem aqui. O financeiro particular deles permanece privado.</p></div><button class="btn primary" onclick="creditPackagesOpenSale()">Nova venda</button></div>
      <div class="credit-package-metrics">
        <article><span>Recebido</span><strong id="cpReceived">R$ 0,00</strong></article>
        <article><span>A receber</span><strong id="cpPending">R$ 0,00</strong></article>
        <article><span>Em atraso</span><strong id="cpOverdue">R$ 0,00</strong></article>
        <article><span>Créditos liberados</span><strong id="cpCredits">0</strong></article>
      </div>
      <div id="cpPackageCards" class="credit-package-grid"></div>
      <div class="credit-package-card"><div class="credit-package-card-head"><div><h3>Compras dos vendedores</h3><p>Histórico de pacotes, pagamentos, liberação e validade.</p></div></div><div class="credit-orders-wrap"><table><thead><tr><th>Data</th><th>Vendedor</th><th>Pacote</th><th>Créditos</th><th>Pagamento</th><th>Liberação</th><th>Validade</th><th>Valor</th><th>Ação</th></tr></thead><tbody id="cpOrders"></tbody></table></div></div>
      <div class="credit-package-card"><div class="credit-package-card-head"><div><h3>Condições por vendedor</h3><p>Autorize compra a prazo e defina o limite máximo de dívida.</p></div></div><div id="cpSellerTerms" class="credit-seller-terms"></div></div>
    </div>`;
  }

  function sellerHtml(){
    return `<div class="credit-packages-shell"><div class="credit-packages-head"><div><small>Meus créditos</small><h2>Compras e validade</h2><p>Suas vendas para clientes continuam privadas e separadas destas compras.</p></div></div>
      <div class="credit-package-metrics"><article><span>Saldo atual</span><strong id="cpSellerBalance">0</strong></article><article><span>Dívida em aberto</span><strong id="cpSellerDebt">R$ 0,00</strong></article><article><span>Limite autorizado</span><strong id="cpSellerLimit">R$ 0,00</strong></article><article><span>Próximo vencimento</span><strong id="cpSellerExpiry">—</strong></article></div>
      <div id="cpSellerPackages" class="credit-package-grid"></div><div class="credit-package-card"><div class="credit-package-card-head"><div><h3>Minhas compras</h3><p>Pacotes comprados, pagamentos e data de expiração.</p></div></div><div id="cpSellerOrders" class="credit-seller-orders"></div></div></div>`;
  }

  function ensureAdmin(){
    if (!/\/dashboard\.html$/i.test(location.pathname)) return false;
    const nav=document.querySelector('.tabs'); const heading=document.querySelector('.admin-page-heading'); if(!nav||!heading)return false;
    if(!document.querySelector('[data-tab="credit-packages"]')){ const b=document.createElement('button'); b.className='tab'; b.dataset.tab='credit-packages'; b.type='button'; b.innerHTML='<span>Créditos</span>'; b.onclick=()=>window.setTab?.('credit-packages'); nav.appendChild(b); }
    if(!$('section-credit-packages')){ const s=document.createElement('section'); s.id='section-credit-packages'; s.className='section'; s.innerHTML=adminHtml(); heading.insertAdjacentElement('afterend',s); }
    if(!window.__cpTabPatched && typeof window.setTab==='function'){ window.__cpTabPatched=true; const original=window.setTab; window.setTab=function(tab){ original(tab); if(tab==='credit-packages'){ if($('adminPageEyebrow'))$('adminPageEyebrow').textContent='Financeiro da empresa'; if($('adminPageTitle'))$('adminPageTitle').textContent='Venda de créditos'; if($('adminPageDescription'))$('adminPageDescription').textContent='Pacotes, cobranças e validade sem acessar o financeiro privado do vendedor.'; load().catch(error=>alert(error.message)); } }; }
    return true;
  }

  function ensureSeller(){
    if(!/\/seller\.html$/i.test(location.pathname))return false;
    const nav=document.querySelector('.seller-v2-nav'); const dash=$('dashboardView'); if(!nav||!dash)return false;
    if(!nav.querySelector('[data-seller-nav="credit-purchases"]')){ const b=document.createElement('button'); b.dataset.sellerNav='credit-purchases'; b.type='button'; b.textContent='Meus créditos'; b.onclick=()=>{window.sellerPortalNavigate?.('credit-purchases');load().catch(error=>alert(error.message));}; nav.appendChild(b); }
    if(!$('sellerCreditPurchasesCard')){ const c=document.createElement('div'); c.id='sellerCreditPurchasesCard'; c.className='card seller-portal-section'; c.dataset.sellerSection='credit-purchases'; c.hidden=true; c.innerHTML=sellerHtml(); dash.appendChild(c); window.sellerPortalRefreshNavigation?.(); }
    return true;
  }

  function renderPackages(target){
    const host=$(target); if(!host)return;
    host.innerHTML=(data.packages||[]).map(pkg=>`<article class="credit-package-option ${pkg.code==='BASICO_50'?'featured':''}"><small>${esc(pkg.name)}</small><strong>${Number(pkg.credits).toLocaleString('pt-BR')} créditos</strong><b>${money(pkg.price_cents)}</b><span>Validade de ${pkg.validity_days} dias</span>${pkg.code==='BASICO_50'?'<em>Mais vantajoso</em>':''}</article>`).join('');
  }

  function renderAdmin(){
    const s=data.summary||{}; $('cpReceived').textContent=money(s.receivedCents); $('cpPending').textContent=money(s.pendingCents); $('cpOverdue').textContent=money(s.overdueCents); $('cpCredits').textContent=Number(s.creditsSold||0).toLocaleString('pt-BR'); renderPackages('cpPackageCards');
    $('cpOrders').innerHTML=(data.orders||[]).length?(data.orders||[]).map(o=>`<tr><td>${date(o.createdAt)}</td><td>${esc(o.sellerName||'—')}</td><td>${esc(o.packageName)} × ${o.packageQuantity}</td><td>${Number(o.creditsTotal).toLocaleString('pt-BR')}</td><td><span class="cp-status ${o.paymentStatus}">${esc(paymentLabel(o.paymentStatus))}</span></td><td>${esc(creditLabel(o.creditsStatus))}</td><td>${date(o.expiresAt)}</td><td><strong>${money(o.totalAmountCents)}</strong></td><td>${o.paymentStatus!=='paid'&&o.paymentStatus!=='cancelled'?`<button onclick="creditPackagesMarkPaid('${o.id}')">Marcar como pago</button>`:'—'}</td></tr>`).join(''):'<tr><td colspan="9" class="credit-packages-empty">Nenhuma compra registrada.</td></tr>';
    $('cpSellerTerms').innerHTML=(data.sellers||[]).length?(data.sellers||[]).map(s=>`<div class="credit-seller-term"><div><strong>${esc(s.name)}</strong><span>Saldo: ${Number(s.creditBalance||0).toLocaleString('pt-BR')} créditos</span></div><label><input id="cpTermsAllowed-${s.id}" type="checkbox" ${s.allowCreditPurchasesOnTerms?'checked':''}> Compra a prazo</label><label>Limite (R$)<input id="cpTermsLimit-${s.id}" type="number" min="0" step="0.01" value="${(s.financialCreditLimitCents/100).toFixed(2)}"></label><button onclick="creditPackagesSaveTerms('${s.id}')">Salvar</button></div>`).join(''):'<p class="credit-packages-empty">Nenhum vendedor ativo encontrado.</p>';
  }

  function renderSeller(){
    const seller=data.seller||{}; $('cpSellerBalance').textContent=Number(seller.creditBalance||0).toLocaleString('pt-BR'); $('cpSellerDebt').textContent=money(seller.openDebtCents); $('cpSellerLimit').textContent=money(seller.financialCreditLimitCents); const next=(data.lots||[])[0]; $('cpSellerExpiry').textContent=next?date(next.expires_at):'—'; renderPackages('cpSellerPackages');
    $('cpSellerOrders').innerHTML=(data.orders||[]).length?(data.orders||[]).map(o=>`<article><div><strong>${esc(o.packageName)} × ${o.packageQuantity}</strong><span>${Number(o.creditsTotal).toLocaleString('pt-BR')} créditos · comprado em ${date(o.createdAt)}</span><small>Pagamento: ${esc(paymentLabel(o.paymentStatus))} · Créditos: ${esc(creditLabel(o.creditsStatus))} · Validade: ${date(o.expiresAt)}</small></div><b>${money(o.totalAmountCents)}</b></article>`).join(''):'<p class="credit-packages-empty">Nenhuma compra registrada.</p>';
  }

  async function load(){ data=await api({action:'dashboard'}); data.role==='seller'?renderSeller():renderAdmin(); }
  window.creditPackagesLoad=load;

  window.creditPackagesOpenSale=function(){
    if(!data){alert('Carregue a área de créditos antes de registrar uma venda.');return;}
    const sellers=(data.sellers||[]).filter(s=>s.status==='active'); const packages=data.packages||[];
    if(!sellers.length||!packages.length){alert('É necessário ter vendedor ativo e pacote disponível.');return;}
    const modal=document.createElement('div'); modal.className='cp-modal open'; modal.id='cpModal'; modal.innerHTML=`<div class="cp-modal-card"><h2>Nova venda de créditos</h2><p>Selecione o pacote e defina quando os créditos serão liberados.</p><label>Vendedor<select id="cpSaleSeller"><option value="">Selecione</option>${sellers.map(s=>`<option value="${s.id}">${esc(s.name)}</option>`).join('')}</select></label><label>Pacote<select id="cpSalePackage">${packages.map(p=>`<option value="${p.id}">${esc(p.name)} — ${p.credits} créditos — ${money(p.price_cents)}</option>`).join('')}</select></label><label>Quantidade de pacotes<input id="cpSaleQty" type="number" min="1" value="1"></label><label>Status do pagamento<select id="cpSaleStatus"><option value="paid">Pago</option><option value="pending">Pendente</option></select></label><label>Forma de pagamento<select id="cpSalePayment"><option value="pix">Pix</option><option value="cash">Dinheiro</option><option value="card">Cartão</option><option value="bank_transfer">Transferência</option><option value="boleto">Boleto</option><option value="other">Outro</option></select></label><label>Liberação dos créditos<select id="cpSaleRelease"><option value="immediate">Liberar agora</option><option value="after_payment">Liberar somente após o pagamento</option></select></label><label>Vencimento<input id="cpSaleDue" type="date"></label><label>Observação<textarea id="cpSaleNotes"></textarea></label><div class="actions"><button class="btn primary" onclick="creditPackagesSubmitSale()">Confirmar venda</button><button class="btn" onclick="document.getElementById('cpModal').remove()">Cancelar</button></div></div>`; document.body.appendChild(modal);
  };

  window.creditPackagesSubmitSale=async function(){ try{const sellerId=$('cpSaleSeller').value;if(!sellerId)throw new Error('Selecione o vendedor.');await api({action:'createOrder',sellerId,packageId:$('cpSalePackage').value,packageQuantity:Number($('cpSaleQty').value||1),paymentStatus:$('cpSaleStatus').value,paymentMethod:$('cpSalePayment').value,releasePolicy:$('cpSaleRelease').value,dueDate:$('cpSaleDue').value||null,notes:$('cpSaleNotes').value||null,idempotencyKey:operationKey('credit-package')}); $('cpModal')?.remove(); await load(); alert('Venda registrada com sucesso.'); }catch(e){alert(e.message);} };
  window.creditPackagesMarkPaid=async id=>{ try{await api({action:'updatePayment',orderId:id,paymentStatus:'paid'});await load();alert('Pagamento confirmado.');}catch(e){alert(e.message);} };
  window.creditPackagesSaveTerms=async id=>{ try{const value=Number(String($(`cpTermsLimit-${id}`).value).replace(',','.'));if(!Number.isFinite(value)||value<0)throw new Error('Informe um limite válido.');await api({action:'updateSellerTerms',sellerId:id,allowCreditPurchasesOnTerms:$(`cpTermsAllowed-${id}`).checked,financialCreditLimitCents:Math.round(value*100)});await load();alert('Condições atualizadas.');}catch(e){alert(e.message);} };

  function boot(){ const ok=ensureAdmin()||ensureSeller(); if(ok && /seller\.html$/i.test(location.pathname)) setTimeout(()=>load().catch(()=>{}),800); }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();