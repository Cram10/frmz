function showTab(tabId) {
    
    document.querySelectorAll('.tab-content').forEach(tab => {
        tab.style.display = 'none';
    });

    
    document.querySelectorAll('.tab-button').forEach(button => {
        button.classList.remove('active');
    });

    
    document.getElementById(tabId).style.display = 'block';

    
    event.currentTarget.classList.add('active');
}
