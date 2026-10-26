const copy={
 en:['All','Reset filters','No applicants match these filters.','Showing {count} of {total} applicants'],
 de:['Alle','Filter zurücksetzen','Keine Bewerbungen entsprechen diesen Filtern.','{count} von {total} Bewerbungen'],
 fr:['Tous','Réinitialiser les filtres','Aucune candidature ne correspond à ces filtres.','{count} candidatures sur {total}'],
 es:['Todos','Restablecer filtros','Ningún solicitante coincide con estos filtros.','Mostrando {count} de {total} solicitantes'],
 pt:['Todos','Limpar filtros','Nenhum candidato corresponde a estes filtros.','Mostrando {count} de {total} candidatos'],
 ko:['전체','필터 초기화','필터와 일치하는 신청자가 없습니다.','전체 {total}명 중 {count}명 표시'],
 vi:['Tất cả','Đặt lại bộ lọc','Không có ứng viên phù hợp với các bộ lọc này.','Hiển thị {count} trên {total} ứng viên'],
 ar:['الكل','إعادة ضبط الفلاتر','لا يوجد متقدمون يطابقون هذه الفلاتر.','عرض {count} من أصل {total} متقدمًا']
};
export function messengerFilterCopy(language){const [all,reset,noMatch,count]=copy[language]||copy.en;return {all,reset,noMatch,count};}
export function applicantMatchesFilters(player,filters={}){return ['server','transferGroup'].every(key=>filters[key]===undefined||String(player[key]??'').trim()===filters[key]);}
