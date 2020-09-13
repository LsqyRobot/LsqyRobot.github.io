var getQuote = function() {
    var $btn = $('#get-quote').button('loading');
    $('#quote-container').html('');
    $.getJSON('http://ron-swanson-quotes.herokuapp.com/quotes', function(result) {
        $('#quote-container').fadeIn(1000, function() {
            $('#quote-container').html(result.quote)
        });
    })
    $btn.button('reset');
};

$('#get-quote').click(function() {
    var $btn = $(this).button('loading');
    getQuote();
    $btn.button('reset');
});
